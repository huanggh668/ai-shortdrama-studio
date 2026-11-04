import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  AppEvent,
  AppSettings,
  Episode,
  Project,
  RunPipelineRequest,
  Shot,
  StageKey
} from '../../../shared/types'
import { STAGE_META, STAGE_ORDER } from '../../../shared/constants'
import { createCharacter, createShot, ProjectStore } from '../projectStore'
import type { TaskQueue } from '../taskQueue'
import { pool } from '../taskQueue'
import type { MediaService } from '../media/ffmpeg'
import {
  buildCues,
  defaultFontName,
  effectiveDuration,
  shotText,
  toAss,
  toSrt
} from '../media/subtitles'
import { DemoImageProvider } from '../providers/demoImage'
import type { ImageRenderer } from '../render/imageRenderer'
import type { ProviderBundle } from '../providers/registry'
import type { RawShot } from '../providers/types'
import {
  composeImagePrompt,
  composePortraitPrompt,
  composeVideoPrompt,
  defaultNegativePrompt
} from './prompts'
import {
  clamp,
  ensureDir,
  estimateSpeechSeconds,
  exists,
  formatError,
  hashString,
  newId,
  slugifyFilename
} from '../utils'

const TITLE_CARD_DURATION = 2
const END_CARD_DURATION = 1.6

const DOWNSTREAM: Record<StageKey, StageKey[]> = {
  script: ['characters', 'storyboard', 'images', 'audio', 'videos', 'subtitles', 'render'],
  characters: ['images', 'videos', 'render'],
  storyboard: ['images', 'audio', 'videos', 'subtitles', 'render'],
  images: ['videos', 'render'],
  audio: ['videos', 'subtitles', 'render'],
  videos: ['render'],
  subtitles: ['render'],
  render: []
}

export interface PipelineDeps {
  store: ProjectStore
  tasks: TaskQueue
  media: MediaService
  imageRenderer: ImageRenderer
  getSettings(): Promise<AppSettings>
  makeProviders(settings: AppSettings): ProviderBundle
  emit(event: AppEvent): void
}

export class PipelineEngine {
  private readonly deps: PipelineDeps
  private readonly controllers = new Map<string, AbortController>()
  private readonly persistChains = new Map<string, Promise<unknown>>()
  private readonly cardProvider: DemoImageProvider

  constructor(deps: PipelineDeps) {
    this.deps = deps
    this.cardProvider = new DemoImageProvider(deps.imageRenderer)
  }

  isRunning(projectId: string): boolean {
    return this.controllers.has(projectId)
  }

  cancel(projectId: string): void {
    this.controllers.get(projectId)?.abort()
  }

  async run(req: RunPipelineRequest): Promise<void> {
    if (this.controllers.has(req.projectId)) throw new Error('该项目正在生成中，请等待当前任务完成')
    const controller = new AbortController()
    this.controllers.set(req.projectId, controller)
    const task = this.deps.tasks.create(req.shotId ? 'regenerate' : 'pipeline', req.shotId ? '重新生成镜头' : '一键生成短剧', req.projectId)
    const signal = controller.signal
    let project: Project | null = null
    let currentStage: StageKey | null = null
    try {
      const settings = await this.deps.getSettings()
      const providers = this.deps.makeProviders(settings)
      const loaded = await this.deps.store.get(req.projectId)
      project = loaded
      const stages = this.resolveStages(loaded, req)
      if (stages.length === 0) {
        task.complete('没有需要执行的阶段')
        return
      }
      for (const [index, stage] of stages.entries()) {
        if (signal.aborted) throw new DOMException('已取消', 'AbortError')
        currentStage = stage
        const overallBase = index / stages.length
        const overallSpan = 1 / stages.length
        loaded.stages[stage] = { status: 'running', progress: 0, message: '准备中', updatedAt: Date.now() }
        await this.persist(loaded)
        task.setProgress(overallBase * 100, STAGE_META[stage].label)
        const report = async (progress: number, message?: string): Promise<void> => {
          loaded.stages[stage] = {
            ...loaded.stages[stage],
            status: 'running',
            progress: Math.round(progress),
            message,
            updatedAt: Date.now()
          }
          await this.persist(loaded)
          task.setProgress((overallBase + (progress / 100) * overallSpan) * 100, `${STAGE_META[stage].label}${message ? ` · ${message}` : ''}`)
        }
        const detail = await this.runStage(loaded, stage, providers, settings, signal, report)
        loaded.stages[stage] = {
          status: 'done',
          progress: 100,
          message: detail?.message,
          updatedAt: Date.now()
        }
        await this.persist(loaded)
        task.setProgress((overallBase + overallSpan) * 100, STAGE_META[stage].label)
        currentStage = null
      }
      task.complete('生成完成')
      this.deps.emit({ type: 'pipeline:done', projectId: loaded.id, ok: true })
    } catch (error) {
      const aborted = signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
      const message = formatError(error)
      if (project && currentStage) {
        project.stages[currentStage] = {
          ...project.stages[currentStage],
          status: aborted ? 'idle' : 'failed',
          message: aborted ? '已取消' : project.stages[currentStage].message,
          error: aborted ? undefined : message,
          updatedAt: Date.now()
        }
        await this.persist(project).catch(() => undefined)
      }
      if (aborted) {
        task.cancel('已取消')
        this.deps.emit({ type: 'pipeline:done', projectId: req.projectId, ok: false, error: '已取消' })
      } else {
        task.fail(message)
        this.deps.emit({ type: 'pipeline:done', projectId: req.projectId, ok: false, error: message })
      }
      throw error
    } finally {
      this.controllers.delete(req.projectId)
    }
  }

  async regenerateShot(req: { projectId: string; shotId: string; kind: 'image' | 'video' | 'audio' }): Promise<void> {
    if (this.controllers.has(req.projectId)) throw new Error('该项目正在生成中')
    const controller = new AbortController()
    this.controllers.set(req.projectId, controller)
    const task = this.deps.tasks.create('regenerate', `重新生成${req.kind === 'image' ? '画面' : req.kind === 'video' ? '视频' : '配音'}`, req.projectId)
    try {
      const settings = await this.deps.getSettings()
      const providers = this.deps.makeProviders(settings)
      const project = await this.deps.store.get(req.projectId)
      const found = findShot(project, req.shotId)
      if (!found) throw new Error('镜头不存在')
      if (req.kind === 'image') {
        await this.generateShotImage(project, found.episode, found.shot, providers, settings, controller.signal, true)
      } else if (req.kind === 'audio') {
        await this.generateShotAudio(project, found.episode, found.shot, providers, settings, controller.signal, true)
      } else {
        await this.generateShotVideo(project, found.episode, found.shot, providers, settings, controller.signal, true)
      }
      task.complete('已重新生成')
      await this.persist(project)
    } catch (error) {
      task.fail(formatError(error))
      throw error
    } finally {
      this.controllers.delete(req.projectId)
    }
  }

  async mergeSeries(projectId: string): Promise<string> {
    const project = await this.deps.store.get(projectId)
    const entries = project.episodes
      .map((episode) => ({ episode, file: project.exports?.[episode.id] }))
      .filter((item): item is { episode: Episode; file: string } => Boolean(item.file))
    if (entries.length === 0) throw new Error('还没有已导出的分集，请先生成成片')
    const files: string[] = []
    for (const entry of entries) {
      const abs = this.abs(projectId, entry.file)
      if (!(await exists(abs))) throw new Error(`第 ${entry.episode.index} 集的成片文件缺失，请重新导出`)
      files.push(abs)
    }
    const outAbs = this.deps.store.assetPath(
      projectId,
      'exports',
      `${slugifyFilename(project.title)}-全剧-${timestamp()}.mp4`
    )
    await ensureDir(path.dirname(outAbs))
    await this.deps.media.concat(files, outAbs)
    project.seriesExportPath = this.rel(projectId, outAbs)
    await this.persist(project)
    return outAbs
  }

  private resolveStages(project: Project, req: RunPipelineRequest): StageKey[] {
    if (req.stages?.length) {
      return STAGE_ORDER.filter((stage) => req.stages!.includes(stage))
    }
    const start = req.from ?? this.nextStage(project)
    const index = STAGE_ORDER.indexOf(start)
    return STAGE_ORDER.slice(Math.max(0, index))
  }

  private nextStage(project: Project): StageKey {
    if (!project.bible || project.episodes.length === 0) return 'script'
    if (project.bible.characters.some((character) => character.portraitStatus !== 'done')) return 'characters'
    if (project.episodes.some((episode) => episode.shots.length === 0)) return 'storyboard'
    const shots = project.episodes.flatMap((episode) => episode.shots)
    if (shots.some((shot) => shot.image.status !== 'done')) return 'images'
    if (shots.some((shot) => shot.audio.status === 'pending' || shot.audio.status === 'failed')) return 'audio'
    if (shots.some((shot) => shot.video.status !== 'done')) return 'videos'
    if (!project.subtitles || project.episodes.some((episode) => !project.subtitles?.[episode.id])) return 'subtitles'
    return 'render'
  }

  private async runStage(
    project: Project,
    stage: StageKey,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ): Promise<{ message?: string } | void> {
    switch (stage) {
      case 'script':
        return this.runScript(project, providers, signal, report)
      case 'characters':
        return this.runCharacters(project, providers, settings, signal, report)
      case 'storyboard':
        return this.runStoryboard(project, providers, signal, report)
      case 'images':
        return this.runImages(project, providers, settings, signal, report)
      case 'audio':
        return this.runAudio(project, providers, settings, signal, report)
      case 'videos':
        return this.runVideos(project, providers, settings, signal, report)
      case 'subtitles':
        return this.runSubtitles(project, settings, report)
      case 'render':
        return this.runRender(project, settings, signal, report)
      default:
        return
    }
  }

  private async runScript(
    project: Project,
    providers: ProviderBundle,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    await report(10, '扩写故事梗概')
    const input = storyInput(project)
    const result = await providers.story.createBible(input, signal)
    const existingCharacters = project.bible?.characters ?? []
    const characters = result.characters.map((raw, index) => {
      const previous = existingCharacters.find((character) => character.name === raw.name) ?? existingCharacters[index]
      return createCharacter({
        ...raw,
        id: previous?.id,
        portraitPath: previous?.portraitPath,
        portraitStatus: previous?.portraitStatus ?? 'pending'
      })
    })
    project.bible = {
      logline: result.logline,
      synopsis: result.synopsis,
      tone: result.tone,
      characters
    }
    project.episodes = result.outlines.map((outline, index) => {
      const previous = project.episodes[index]
      return {
        id: previous?.id ?? newId('ep'),
        index: index + 1,
        title: outline.title,
        synopsis: outline.synopsis,
        beats: outline.beats,
        shots: previous?.shots ?? []
      }
    })
    for (const episode of project.episodes) {
      for (const shot of episode.shots) {
        markShotAssetsStale(shot, ['image', 'audio', 'video'])
      }
    }
    this.markStagesStale(project, 'script')
    await report(100, `${characters.length} 个角色 · ${project.episodes.length} 集`)
    return { message: `${project.episodes.length} 集大纲已生成` }
  }

  private async runCharacters(
    project: Project,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    if (!project.bible) throw new Error('请先生成剧本大纲')
    const characters = project.bible.characters
    let completed = 0
    let succeeded = 0
    let failed = 0
    for (const character of characters) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      const abs = this.deps.store.assetPath(project.id, 'images', `char-${slugifyFilename(character.name)}.png`)
      if (character.portraitStatus === 'done' && character.portraitPath && (await exists(abs))) {
        completed += 1
        succeeded += 1
        await report((completed / characters.length) * 100, `${character.name} 已存在`)
        continue
      }
      try {
        character.portraitStatus = 'running'
        await report((completed / characters.length) * 100, `定妆 ${character.name}`)
        await providers.image.generate({
          prompt: composePortraitPrompt(character, project),
          negativePrompt: defaultNegativePrompt(),
          width: 1024,
          height: 1536,
          aspect: '9:16',
          outPath: abs,
          kind: 'portrait',
          title: character.name,
          subtitle: `${character.role} · 角色定妆`,
          body: character.appearancePrompt || character.description,
          seed: hashString(character.id),
          signal
        })
        character.portraitPath = this.rel(project.id, abs)
        character.portraitStatus = 'done'
        succeeded += 1
      } catch (error) {
        failed += 1
        character.portraitStatus = 'failed'
        this.log('warn', `角色 ${character.name} 定妆失败：${formatError(error)}`, project.id)
      }
      completed += 1
      await report((completed / characters.length) * 100, `${completed}/${characters.length}`)
    }
    if (failed > 0 && succeeded === 0) {
      throw new Error('所有角色定妆都失败了，请检查图像供应商配置')
    }
    this.markStagesStale(project, 'characters')
    for (const episode of project.episodes) {
      for (const shot of episode.shots) markShotAssetsStale(shot, ['image', 'video'])
    }
    return {
      message: failed > 0 ? `${succeeded} 个成功 · ${failed} 个失败` : `${succeeded} 个角色定妆`
    }
  }

  private async runStoryboard(
    project: Project,
    providers: ProviderBundle,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    if (!project.bible) throw new Error('请先生成剧本大纲')
    const bible = project.bible
    let completed = 0
    for (const [index, episode] of project.episodes.entries()) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      const raw = await providers.story.createShots(
        {
          project: storyInput(project),
          bible: {
            logline: bible.logline,
            synopsis: bible.synopsis,
            tone: bible.tone,
            characters: bible.characters.map((character) => ({
              name: character.name,
              role: character.role,
              description: character.description,
              appearancePrompt: character.appearancePrompt,
              personality: character.personality,
              voice: character.voice
            }))
          },
          episode: {
            title: episode.title,
            synopsis: episode.synopsis,
            beats: episode.beats ?? []
          },
          episodeIndex: index
        },
        signal
      )
      const normalized = normalizeShots(raw, project.episodeDuration)
      episode.shots = normalized.map((shot, shotIndex) =>
        createShot(episode.id, shotIndex + 1, {
          ...shot,
          image: { status: 'pending' },
          audio: { status: 'pending' },
          video: { status: 'pending' }
        })
      )
      completed += 1
      await report((completed / project.episodes.length) * 100, `第 ${episode.index} 集 · ${episode.shots.length} 镜头`)
    }
    this.markStagesStale(project, 'storyboard')
    for (const episode of project.episodes) {
      for (const shot of episode.shots) markShotAssetsStale(shot, ['image', 'audio', 'video'])
    }
    return { message: `${project.episodes.length} 集分镜已生成` }
  }

  private async runImages(
    project: Project,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    const targets = project.episodes.flatMap((episode) =>
      episode.shots.map((shot) => ({ episode, shot }))
    )
    const pending: typeof targets = []
    for (const target of targets) {
      if (target.shot.image.status === 'done' && target.shot.image.path) {
        const abs = this.abs(project.id, target.shot.image.path)
        if (await exists(abs)) continue
      }
      pending.push(target)
    }
    if (pending.length === 0) return { message: '全部关键帧已就绪' }
    let done = 0
    let failed = 0
    await pool(
      pending,
      settings.media.imageConcurrency,
      async (target) => {
        try {
          await this.generateShotImage(project, target.episode, target.shot, providers, settings, signal, false)
        } catch (error) {
          failed += 1
          this.log('warn', `镜头 ${target.shot.no} 画面失败：${formatError(error)}`, project.id)
        }
        done += 1
        await report((done / pending.length) * 100, `${done}/${pending.length}`)
      },
      { signal }
    )
    if (failed === pending.length) throw new Error('所有关键帧生成失败，请检查图像供应商配置')
    return { message: `${pending.length - failed}/${pending.length} 个关键帧完成` }
  }

  private async runAudio(
    project: Project,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    const targets = project.episodes.flatMap((episode) =>
      episode.shots.map((shot) => ({ episode, shot }))
    )
    let done = 0
    let failed = 0
    for (const target of targets) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      const text = shotText(target.shot)
      if (!text) {
        target.shot.audio = { status: 'skipped', duration: 0 }
      } else if (providers.tts.id === 'silent-tts') {
        target.shot.audio = { status: 'skipped', duration: estimateSpeechSeconds(text) }
      } else {
        try {
          await this.generateShotAudio(project, target.episode, target.shot, providers, settings, signal, false)
        } catch (error) {
          failed += 1
          target.shot.audio = {
            ...target.shot.audio,
            status: 'failed',
            duration: target.shot.audio.duration || estimateSpeechSeconds(text),
            error: formatError(error)
          }
          this.log('warn', `镜头 ${target.shot.no} 配音失败：${formatError(error)}`, project.id)
        }
      }
      done += 1
      await report((done / targets.length) * 100, `${done}/${targets.length}`)
    }
    if (failed > 0 && failed === targets.length) {
      throw new Error('所有配音都失败了，请检查系统语音或 TTS 配置')
    }
    return { message: failed > 0 ? `${failed} 个镜头配音失败，已使用估算时长` : '配音完成' }
  }

  private async runVideos(
    project: Project,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    const targets = project.episodes.flatMap((episode) =>
      episode.shots.map((shot) => ({ episode, shot }))
    )
    const pending: typeof targets = []
    for (const target of targets) {
      if (target.shot.video.status === 'done' && target.shot.video.path) {
        if (await exists(this.abs(project.id, target.shot.video.path))) continue
      }
      pending.push(target)
    }
    if (pending.length === 0) return { message: '全部视频片段已就绪' }
    let done = 0
    let failed = 0
    await pool(
      pending,
      settings.media.videoConcurrency,
      async (target) => {
        try {
          await this.generateShotVideo(project, target.episode, target.shot, providers, settings, signal, false)
        } catch (error) {
          failed += 1
          target.shot.video = {
            ...target.shot.video,
            status: 'failed',
            error: formatError(error)
          }
          this.log('warn', `镜头 ${target.shot.no} 视频失败：${formatError(error)}`, project.id)
        }
        done += 1
        await report((done / pending.length) * 100, `${done}/${pending.length}`)
      },
      { signal }
    )
    if (failed === pending.length) throw new Error('所有视频片段生成失败，请检查视频供应商配置')
    return { message: `${pending.length - failed}/${pending.length} 个视频片段完成` }
  }

  private async runSubtitles(
    project: Project,
    settings: AppSettings,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    const offset = project.titleCard ? TITLE_CARD_DURATION : 0
    project.subtitles = project.subtitles ?? {}
    const fontName = settings.media.subtitleFont || defaultFontName()
    const size = canvasSize(project)
    for (const [index, episode] of project.episodes.entries()) {
      const cues = buildCues(episode.shots, offset)
      const srtPath = this.deps.store.assetPath(project.id, 'subtitles', `ep-${pad(episode.index)}.srt`)
      const assPath = this.deps.store.assetPath(project.id, 'subtitles', `ep-${pad(episode.index)}.ass`)
      await ensureDir(path.dirname(srtPath))
      await fs.writeFile(srtPath, toSrt(cues), 'utf8')
      await fs.writeFile(assPath, toAss(cues, { width: size.width, height: size.height, fontName }), 'utf8')
      project.subtitles[episode.id] = {
        srt: this.rel(project.id, srtPath),
        ass: this.rel(project.id, assPath)
      }
      await report(((index + 1) / project.episodes.length) * 100, `第 ${episode.index} 集`)
    }
    return { message: '字幕已生成' }
  }

  private async runRender(
    project: Project,
    settings: AppSettings,
    signal: AbortSignal,
    report: (progress: number, message?: string) => Promise<void>
  ) {
    project.exports = project.exports ?? {}
    let rendered = 0
    let failed = 0
    let lastError = ''
    const warnings: string[] = []
    for (const [index, episode] of project.episodes.entries()) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      try {
        const result = await this.renderEpisode(project, episode, settings, signal)
        project.exports[episode.id] = this.rel(project.id, result.path)
        warnings.push(...result.warnings)
        rendered += 1
      } catch (error) {
        failed += 1
        lastError = formatError(error)
        this.log('error', `第 ${episode.index} 集合成失败：${lastError}`, project.id)
        project.stages.render.error = lastError
      }
      await report(((index + 1) / project.episodes.length) * 100, `第 ${episode.index} 集 · ${rendered} 成片`)
    }
    if (failed > 0) {
      throw new Error(`${rendered} 集成功，${failed} 集失败：${lastError}`)
    }
    if (warnings.length > 0) {
      return { message: `${rendered} 集成片已导出 · ${warnings.length} 处字幕降级` }
    }
    return { message: `${rendered} 集成片已导出` }
  }

  private async renderEpisode(
    project: Project,
    episode: Episode,
    settings: AppSettings,
    signal: AbortSignal
  ): Promise<{ path: string; warnings: string[] }> {
    const usable = episode.shots.filter((shot) => shot.video.status === 'done' && shot.video.path)
    if (usable.length === 0) throw new Error('没有可合成的视频片段')
    const size = canvasSize(project)
    const workDir = this.deps.store.assetPath(project.id, 'work', `ep-${pad(episode.index)}`)
    await fs.rm(workDir, { recursive: true, force: true })
    await ensureDir(workDir)
    const clips: string[] = []

    if (project.titleCard) {
      const cardAbs = this.deps.store.assetPath(project.id, 'images', 'cards', `title-ep-${pad(episode.index)}.png`)
      await this.cardProvider.generate({
        prompt: project.title,
        width: size.width,
        height: size.height,
        aspect: project.aspect,
        outPath: cardAbs,
        kind: 'title',
        title: project.title,
        subtitle: `第 ${episode.index} 集 · ${episode.title}`,
        seed: hashString(project.id + episode.id)
      })
      const cardRaw = path.join(workDir, 'title-raw.mp4')
      await this.deps.media.imageToVideo({
        imagePath: cardAbs,
        outPath: cardRaw,
        duration: TITLE_CARD_DURATION,
        width: size.width,
        height: size.height,
        fps: settings.media.fps,
        seed: 1,
        signal
      })
      const cardClip = path.join(workDir, 'title.mp4')
      await this.deps.media.normalizeShot({
        videoPath: cardRaw,
        outPath: cardClip,
        width: size.width,
        height: size.height,
        fps: settings.media.fps,
        duration: TITLE_CARD_DURATION,
        signal
      })
      clips.push(cardClip)
    }

    for (const [shotIndex, shot] of usable.entries()) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError')
      const videoAbs = this.abs(project.id, shot.video.path!)
      const audioAbs = shot.audio.status === 'done' && shot.audio.path ? this.abs(project.id, shot.audio.path) : undefined
      const out = path.join(workDir, `shot-${pad(shot.no)}.mp4`)
      await this.deps.media.normalizeShot({
        videoPath: videoAbs,
        audioPath: audioAbs,
        outPath: out,
        width: size.width,
        height: size.height,
        fps: settings.media.fps,
        duration: effectiveDuration(shot),
        signal
      })
      clips.push(out)
    }

    if (project.titleCard) {
      const endAbs = this.deps.store.assetPath(project.id, 'images', 'cards', `end-ep-${pad(episode.index)}.png`)
      await this.cardProvider.generate({
        prompt: '本集完',
        width: size.width,
        height: size.height,
        aspect: project.aspect,
        outPath: endAbs,
        kind: 'end',
        title: '本集完',
        subtitle: project.title,
        seed: hashString(episode.id)
      })
      const endRaw = path.join(workDir, 'end-raw.mp4')
      await this.deps.media.imageToVideo({
        imagePath: endAbs,
        outPath: endRaw,
        duration: END_CARD_DURATION,
        width: size.width,
        height: size.height,
        fps: settings.media.fps,
        seed: 2,
        signal
      })
      const endClip = path.join(workDir, 'end.mp4')
      await this.deps.media.normalizeShot({
        videoPath: endRaw,
        outPath: endClip,
        width: size.width,
        height: size.height,
        fps: settings.media.fps,
        duration: END_CARD_DURATION,
        signal
      })
      clips.push(endClip)
    }

    let videoPath = path.join(workDir, 'concat.mp4')
    await this.deps.media.concat(clips, videoPath, signal)

    if (project.bgmPath) {
      const bgmAbs = path.isAbsolute(project.bgmPath)
        ? project.bgmPath
        : this.deps.store.assetPath(project.id, 'audio', project.bgmPath)
      if (await exists(bgmAbs)) {
        const mixed = path.join(workDir, 'mixed.mp4')
        await this.deps.media.mixBgm({
          videoPath,
          bgmPath: bgmAbs,
          outPath: mixed,
          volume: settings.media.bgmVolume,
          signal
        })
        videoPath = mixed
      }
    }

    const exportAbs = this.deps.store.assetPath(
      project.id,
      'exports',
      `${slugifyFilename(project.title)}-EP${pad(episode.index)}-${timestamp()}.mp4`
    )
    await ensureDir(path.dirname(exportAbs))

    const assRel = project.subtitles?.[episode.id]?.ass
    const assAbs = assRel ? this.abs(project.id, assRel) : null
    const warnings: string[] = []
    if (project.subtitle && settings.media.burnSubtitles && assAbs && (await exists(assAbs))) {
      if (await this.deps.media.supportsSubtitles()) {
        try {
          await this.deps.media.burnSubtitles({
            videoPath,
            assPath: assAbs,
            outPath: exportAbs,
            signal
          })
        } catch (error) {
          this.log('warn', `字幕烧录失败，改为无字幕输出：${formatError(error)}`, project.id)
          warnings.push(`第 ${episode.index} 集字幕未烧录`)
          await fs.copyFile(videoPath, exportAbs)
        }
      } else {
        this.log('warn', '当前 ffmpeg 不支持字幕滤镜，已输出无字幕视频（字幕文件已生成）', project.id)
        warnings.push(`第 ${episode.index} 集字幕未烧录（ffmpeg 缺少 libass）`)
        await fs.copyFile(videoPath, exportAbs)
      }
    } else {
      await fs.copyFile(videoPath, exportAbs)
    }

    if (assRel) {
      const srtRel = project.subtitles?.[episode.id]?.srt
      if (srtRel) {
        const srtAbs = this.abs(project.id, srtRel)
        if (await exists(srtAbs)) {
          try {
            await fs.copyFile(srtAbs, exportAbs.replace(/\.mp4$/i, '.srt'))
          } catch {
            warnings.push(`第 ${episode.index} 集外挂字幕复制失败`)
          }
        }
      }
    }

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined)
    return { path: exportAbs, warnings }
  }

  private async generateShotImage(
    project: Project,
    episode: Episode,
    shot: Shot,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    persistNow: boolean
  ): Promise<void> {
    const size = canvasSize(project)
    const outAbs = this.deps.store.assetPath(
      project.id,
      'images',
      `ep-${pad(episode.index)}-shot-${pad(shot.no)}.png`
    )
    shot.image = { ...shot.image, status: 'running', error: undefined }
    if (persistNow) await this.persist(project)
    await providers.image.generate({
      prompt: composeImagePrompt(shot, project, project.bible?.characters ?? []),
      negativePrompt: shot.negativePrompt || defaultNegativePrompt(),
      width: size.width,
      height: size.height,
      aspect: project.aspect,
      outPath: outAbs,
      kind: 'keyframe',
      title: shot.scene,
      subtitle: `第 ${episode.index} 集 · 镜头 ${pad(shot.no)} · ${shot.shotSize} · ${shot.cameraMove}`,
      body: shot.action || shot.imagePrompt,
      seed: hashString(shot.id),
      signal
    })
    shot.image = { path: this.rel(project.id, outAbs), status: 'done' }
    shot.video = { ...shot.video, status: 'stale' }
    void settings
    if (persistNow) await this.persist(project)
  }

  private async generateShotAudio(
    project: Project,
    episode: Episode,
    shot: Shot,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    persistNow: boolean
  ): Promise<void> {
    const text = shotText(shot)
    if (!text) {
      shot.audio = { status: 'skipped', duration: 0 }
      if (persistNow) await this.persist(project)
      return
    }
    const outAbs = this.deps.store.assetPath(
      project.id,
      'audio',
      `ep-${pad(episode.index)}-shot-${pad(shot.no)}.wav`
    )
    shot.audio = { ...shot.audio, status: 'running', error: undefined }
    if (persistNow) await this.persist(project)
    const result = await providers.tts.synthesize({
      text,
      outPath: outAbs,
      voice: settings.providers.tts.kind === 'system'
        ? settings.providers.tts.systemVoice
        : settings.providers.tts.voice,
      rate: settings.providers.tts.rate,
      signal
    })
    shot.audio = {
      path: this.rel(project.id, outAbs),
      status: 'done',
      duration: Math.max(0.5, result.duration)
    }
    shot.video = { ...shot.video, status: 'stale' }
    if (persistNow) await this.persist(project)
  }

  private async generateShotVideo(
    project: Project,
    episode: Episode,
    shot: Shot,
    providers: ProviderBundle,
    settings: AppSettings,
    signal: AbortSignal,
    persistNow: boolean
  ): Promise<void> {
    if (shot.image.status !== 'done' || !shot.image.path) {
      throw new Error('缺少关键帧，无法生成视频')
    }
    const size = canvasSize(project)
    const outAbs = this.deps.store.assetPath(
      project.id,
      'videos',
      `ep-${pad(episode.index)}-shot-${pad(shot.no)}.mp4`
    )
    shot.video = { ...shot.video, status: 'running', error: undefined }
    if (persistNow) await this.persist(project)
    await providers.video.generate({
      imagePath: this.abs(project.id, shot.image.path),
      prompt: composeVideoPrompt(shot, project),
      negativePrompt: shot.negativePrompt || defaultNegativePrompt(),
      duration: effectiveDuration(shot),
      width: size.width,
      height: size.height,
      fps: settings.media.fps,
      outPath: outAbs,
      seed: hashString(shot.id),
      signal
    })
    shot.video = { path: this.rel(project.id, outAbs), status: 'done' }
    if (persistNow) await this.persist(project)
  }

  private markStagesStale(project: Project, from: StageKey): void {
    for (const stage of DOWNSTREAM[from]) {
      if (project.stages[stage]?.status === 'running') continue
      project.stages[stage] = {
        ...project.stages[stage],
        status: 'stale',
        progress: 0,
        updatedAt: Date.now()
      }
    }
  }

  private async persist(project: Project): Promise<void> {
    const previous = this.persistChains.get(project.id) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const saved = await this.deps.store.save(project)
        project.updatedAt = saved.updatedAt
        this.deps.emit({ type: 'project:updated', project: structuredClone(project) })
      })
    this.persistChains.set(project.id, run.catch(() => undefined))
    await run
  }

  private rel(projectId: string, absolute: string): string {
    return path.relative(this.deps.store.projectDir(projectId), absolute).split(path.sep).join('/')
  }

  private abs(projectId: string, relative: string): string {
    return path.isAbsolute(relative)
      ? relative
      : path.join(this.deps.store.projectDir(projectId), relative)
  }

  private log(level: 'info' | 'warn' | 'error', message: string, projectId?: string): void {
    this.deps.emit({ type: 'log', level, message, projectId })
  }
}

function storyInput(project: Project) {
  return {
    title: project.title,
    idea: project.idea,
    genre: project.genre,
    style: project.style,
    aspect: project.aspect,
    episodesCount: Math.max(1, project.episodesCount),
    episodeDuration: project.episodeDuration
  }
}

function canvasSize(project: Project): { width: number; height: number } {
  return project.aspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

function markShotAssetsStale(shot: Shot, kinds: Array<'image' | 'audio' | 'video'>): void {
  if (kinds.includes('image') && shot.image.path) shot.image.status = 'stale'
  if (kinds.includes('audio') && shot.audio.path) shot.audio.status = 'stale'
  if (kinds.includes('video') && shot.video.path) shot.video.status = 'stale'
}

function findShot(project: Project, shotId: string): { episode: Episode; shot: Shot } | null {
  for (const episode of project.episodes) {
    const shot = episode.shots.find((item) => item.id === shotId)
    if (shot) return { episode, shot }
  }
  return null
}

function normalizeShots(raw: RawShot[], targetDuration: number): RawShot[] {
  if (raw.length === 0) return raw
  const total = raw.reduce((sum, shot) => sum + (shot.duration || 3), 0)
  const ratio = total > 0 ? targetDuration / total : 1
  const shouldScale = Math.abs(ratio - 1) > 0.18
  return raw.map((shot) => ({
    ...shot,
    duration: Math.round(clamp((shot.duration || 3) * (shouldScale ? ratio : 1), 1.5, 8) * 10) / 10
  }))
}
