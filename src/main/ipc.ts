import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type {
  AppSettings,
  CreateProjectInput,
  Project,
  RegenerateShotRequest,
  RunPipelineRequest,
  StageKey,
  TestTarget
} from '../shared/types'
import { IPC } from '../shared/ipc'
import type { AppServices } from './bootstrap'
import { testProvider } from './services/providers/registry'
import { ensureDir, exists, formatError, safeJoin } from './services/utils'

export function registerIpc(services: AppServices): void {
  handle(IPC.projectsList, async () => services.store.list())

  handle(IPC.projectsCreate, async (_event, input: CreateProjectInput) => {
    if (!input?.idea?.trim()) throw new Error('请先写一句话创意')
    return services.store.create(input)
  })

  handle(IPC.projectsGet, async (_event, id: string) => services.store.get(id))

  handle(IPC.projectsSave, async (_event, project: Project) => {
    assertValidProject(project)
    if (!(await services.store.exists(project.id))) throw new Error('项目不存在或已删除')
    const saved = await services.store.save(project)
    services.broadcast({ type: 'project:updated', project: saved })
    return saved
  })

  ipcMain.on(IPC.projectsSaveSync, (event, project: Project) => {
    try {
      assertValidProject(project)
      if (!services.store.existsSync(project.id)) throw new Error('项目不存在或已删除')
      services.store.saveSync(project)
      event.returnValue = true
    } catch (error) {
      event.returnValue = formatError(error)
    }
  })

  handle(IPC.projectsRemove, async (_event, id: string) => {
    services.pipeline.cancel(id)
    await services.store.remove(id)
  })

  handle(IPC.projectsDuplicate, async (_event, id: string) => services.store.duplicate(id))

  handle(IPC.projectsExportBundle, async (_event, id: string) => {
    const parent = BrowserWindow.getFocusedWindow()
    const result = parent
      ? await dialog.showOpenDialog(parent, {
          title: '选择工程包导出位置',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '选择工程包导出位置',
          properties: ['openDirectory', 'createDirectory']
        })
    if (result.canceled || result.filePaths.length === 0) throw new Error('已取消导出')
    const target = await services.store.exportBundle(id, result.filePaths[0])
    shell.showItemInFolder(target)
    return target
  })

  handle(IPC.projectsMergeSeries, async (_event, id: string) => {
    const output = await services.pipeline.mergeSeries(id)
    shell.showItemInFolder(output)
    return output
  })

  handle(IPC.projectsOpenFolder, async (_event, id: string) => {
    const dir = services.store.projectDir(id)
    const error = await shell.openPath(dir)
    if (error) throw new Error(error)
  })

  handle(IPC.projectsRevealFile, async (_event, id: string, relativePath: string) => {
    if (path.isAbsolute(relativePath)) throw new Error('只允许定位项目内文件')
    const target = safeJoin(services.store.projectDir(id), relativePath)
    if (!(await exists(target))) throw new Error('文件不存在')
    shell.showItemInFolder(target)
  })

  handle(IPC.settingsGet, async () => services.settingsStore.getMasked())

  handle(IPC.settingsSave, async (_event, settings: AppSettings) => {
    const saved = await services.settingsStore.save(settings)
    const raw = await services.settingsStore.load()
    services.media.configure(raw.paths)
    return saved
  })

  handle(IPC.settingsTest, async (_event, target: TestTarget) => {
    const settings = await services.settingsStore.load()
    return testProvider(target, settings, services.media, services.renderer)
  })

  handle(IPC.settingsReset, async () => services.settingsStore.reset())

  handle(IPC.pipelineRun, (_event, req: RunPipelineRequest) => {
    void services.pipeline.run(req).catch(() => undefined)
    return true
  })

  handle(IPC.pipelineCancel, (_event, projectId: string) => {
    services.pipeline.cancel(projectId)
    return true
  })

  handle(IPC.pipelineRegenerateShot, (_event, req: RegenerateShotRequest) => {
    void services.pipeline.regenerateShot(req).catch(() => undefined)
    return true
  })

  handle(IPC.assetsPickBgm, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择背景音乐',
      properties: ['openFile'],
      filters: [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle(IPC.assetsPickWorkflow, async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 ComfyUI 工作流 JSON',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle(IPC.assetsPickLocalFile, async (_event, kind: 'image' | 'audio' | 'video') => {
    const filters =
      kind === 'image'
        ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        : kind === 'audio'
          ? [{ name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac'] }]
          : [{ name: '视频', extensions: ['mp4', 'mov', 'webm', 'mkv'] }]
    const result = await dialog.showOpenDialog({
      title: '选择文件',
      properties: ['openFile'],
      filters
    })
    return result.canceled ? null : result.filePaths[0]
  })

  handle(IPC.assetsImportImage, async (_event, projectId: string, shotId: string, sourcePath: string) =>
    importShotAsset(services, projectId, shotId, sourcePath, 'image')
  )

  handle(IPC.assetsImportAudio, async (_event, projectId: string, shotId: string, sourcePath: string) =>
    importShotAsset(services, projectId, shotId, sourcePath, 'audio')
  )

  handle(IPC.assetsImportVideo, async (_event, projectId: string, shotId: string, sourcePath: string) =>
    importShotAsset(services, projectId, shotId, sourcePath, 'video')
  )

  handle(IPC.systemInfo, async () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userData: services.dataDir,
    ffmpegPath: services.media.ffmpegPath,
    ffprobePath: services.media.ffprobePath,
    dataDir: services.dataDir
  }))

  handle(IPC.systemOpenPath, async (_event, target: string) => {
    assertWithin(services.dataDir, target)
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })

  handle(IPC.systemRevealPath, async (_event, target: string) => {
    assertWithin(services.dataDir, target)
    shell.showItemInFolder(target)
  })

  handle(IPC.systemOpenExternal, async (_event, url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('只允许打开 http/https 链接')
    }
    await shell.openExternal(url)
  })
}

function handle(channel: string, handler: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      throw new Error(formatError(error))
    }
  })
}

async function importShotAsset(
  services: AppServices,
  projectId: string,
  shotId: string,
  sourcePath: string,
  kind: 'image' | 'audio' | 'video'
): Promise<Project> {
  if (!(await exists(sourcePath))) throw new Error('源文件不存在')
  const project = await services.store.get(projectId)
  const shot = project.episodes.flatMap((episode) => episode.shots).find((item) => item.id === shotId)
  if (!shot) throw new Error('镜头不存在')
  const ext = path.extname(sourcePath).toLowerCase() || (kind === 'image' ? '.png' : kind === 'audio' ? '.wav' : '.mp4')
  const folder = kind === 'image' ? 'images' : kind === 'audio' ? 'audio' : 'videos'
  const fileName = `import-${Date.now()}${ext}`
  const target = services.store.assetPath(projectId, folder, fileName)
  await ensureDir(path.dirname(target))
  await fs.copyFile(sourcePath, target)
  const relative = path.relative(services.store.projectDir(projectId), target).split(path.sep).join('/')

  if (kind === 'image') {
    shot.image = { path: relative, status: 'done' }
    shot.video = { ...shot.video, status: 'stale' }
    touchStages(project, ['images', 'videos', 'render'])
  } else if (kind === 'audio') {
    const info = await services.media.probe(target)
    shot.audio = { path: relative, status: 'done', duration: info.duration || shot.audio.duration }
    shot.video = { ...shot.video, status: 'stale' }
    touchStages(project, ['audio', 'videos', 'subtitles', 'render'])
  } else {
    shot.video = { path: relative, status: 'done' }
    touchStages(project, ['videos', 'render'])
  }
  const saved = await services.store.save(project)
  services.broadcast({ type: 'project:updated', project: saved })
  return saved
}

function touchStages(project: Project, stages: StageKey[]): void {
  for (const stage of stages) {
    project.stages[stage] = { ...project.stages[stage], status: 'stale', progress: 0, updatedAt: Date.now() }
  }
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
const STAGE_STATUSES = new Set(['idle', 'running', 'done', 'failed', 'stale', 'skipped'])
const ASSET_STATUSES = new Set(['pending', 'running', 'done', 'stale', 'failed', 'skipped'])

function assertValidProject(value: unknown): asserts value is Project {
  const project = value as Project
  if (!project || typeof project !== 'object') throw new Error('项目数据格式错误')
  if (!ID_PATTERN.test(project.id)) throw new Error('项目 ID 非法')
  if (project.schemaVersion !== 1) throw new Error('项目版本不受支持')
  text(project.title, 'title', 200, true)
  text(project.idea, 'idea', 5000)
  text(project.genre, 'genre', 120)
  text(project.style, 'style', 120)
  if (project.aspect !== '9:16' && project.aspect !== '16:9') throw new Error('画幅参数非法')
  number(project.episodesCount, 'episodesCount', 1, 50)
  number(project.episodeDuration, 'episodeDuration', 5, 900)
  if (typeof project.subtitle !== 'boolean' || typeof project.titleCard !== 'boolean') {
    throw new Error('项目选项格式错误')
  }
  optionalText(project.bgmPath, 'bgmPath', 1200)
  if (!project.stages || typeof project.stages !== 'object') throw new Error('阶段状态缺失')
  for (const [key, state] of Object.entries(project.stages)) {
    if (!state || typeof state !== 'object') throw new Error(`阶段 ${key} 状态非法`)
    if (!STAGE_STATUSES.has((state as { status: string }).status)) {
      throw new Error(`阶段 ${key} 状态值非法`)
    }
  }
  if (!Array.isArray(project.episodes) || project.episodes.length > 50) {
    throw new Error('分集数量超出限制')
  }
  let totalShots = 0
  for (const episode of project.episodes) {
    if (!ID_PATTERN.test(episode.id)) throw new Error('分集 ID 非法')
    number(episode.index, 'episode.index', 1, 50)
    text(episode.title, 'episode.title', 200, true)
    text(episode.synopsis, 'episode.synopsis', 5000)
    if (episode.beats !== undefined) {
      if (!Array.isArray(episode.beats) || episode.beats.length > 50) throw new Error('情节点数量非法')
      for (const beat of episode.beats) text(beat, 'beat', 500)
    }
    if (!Array.isArray(episode.shots) || episode.shots.length > 200) {
      throw new Error('单集镜头数量超出限制')
    }
    totalShots += episode.shots.length
    for (const shot of episode.shots) {
      if (!ID_PATTERN.test(shot.id)) throw new Error('镜头 ID 非法')
      if (shot.episodeId !== episode.id) throw new Error('镜头与分集不匹配')
      number(shot.no, 'shot.no', 1, 999)
      text(shot.scene, 'shot.scene', 200)
      text(shot.shotSize, 'shot.shotSize', 50)
      text(shot.cameraMove, 'shot.cameraMove', 50)
      number(shot.duration, 'shot.duration', 0.5, 30)
      text(shot.action, 'shot.action', 8000)
      text(shot.dialogue, 'shot.dialogue', 8000)
      text(shot.narration, 'shot.narration', 8000)
      text(shot.imagePrompt, 'shot.imagePrompt', 8000)
      text(shot.videoPrompt, 'shot.videoPrompt', 8000)
      text(shot.negativePrompt, 'shot.negativePrompt', 8000)
      assertAsset(shot.image, 'shot.image', false)
      assertAsset(shot.audio, 'shot.audio', true)
      assertAsset(shot.video, 'shot.video', false)
    }
  }
  if (totalShots > 4000) throw new Error('镜头总数超出限制')
  if (project.bible) {
    const characters = project.bible.characters
    if (!Array.isArray(characters) || characters.length > 30) throw new Error('角色数量超出限制')
    for (const character of characters) {
      if (!ID_PATTERN.test(character.id)) throw new Error('角色 ID 非法')
      text(character.name, 'character.name', 120)
      text(character.role, 'character.role', 120)
      text(character.description, 'character.description', 5000)
      text(character.appearancePrompt, 'character.appearancePrompt', 5000)
      text(character.personality, 'character.personality', 2000)
      text(character.voice, 'character.voice', 500)
      optionalAssetPath(character.portraitPath, 'portraitPath')
      if (!ASSET_STATUSES.has(character.portraitStatus)) throw new Error('角色图片状态非法')
    }
  }
  if (project.exports) {
    for (const [key, file] of Object.entries(project.exports)) {
      if (!ID_PATTERN.test(key)) throw new Error('导出集 ID 非法')
      optionalAssetPath(file, 'export')
    }
  }
  optionalAssetPath(project.seriesExportPath, 'seriesExportPath')
  if (JSON.stringify(project).length > 8 * 1024 * 1024) throw new Error('项目数据过大')
}

function assertAsset(value: unknown, field: string, withDuration: boolean): void {
  const asset = value as { status?: string; path?: string; duration?: number; error?: string }
  if (!asset || typeof asset !== 'object') throw new Error(`${field} 缺失`)
  if (!asset.status || !ASSET_STATUSES.has(asset.status)) throw new Error(`${field}.status 非法`)
  optionalAssetPath(asset.path, `${field}.path`)
  optionalText(asset.error, `${field}.error`, 4000)
  if (withDuration && asset.duration !== undefined) number(asset.duration, `${field}.duration`, 0, 600)
}

function text(value: unknown, field: string, max: number, required = false): void {
  if (typeof value !== 'string') throw new Error(`${field} 必须是文本`)
  if (required && !value.trim()) throw new Error(`${field} 不能为空`)
  if (value.length > max) throw new Error(`${field} 过长`)
}

function optionalText(value: unknown, field: string, max: number): void {
  if (value === undefined || value === null || value === '') return
  text(value, field, max)
}

function optionalAssetPath(value: unknown, field: string): void {
  if (value === undefined || value === null || value === '') return
  if (typeof value !== 'string' || value.length > 1200) throw new Error(`${field} 路径非法`)
  if (path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw new Error(`${field} 必须是项目内相对路径`)
  }
}

function number(value: unknown, field: string, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} 数值非法`)
  }
}

function assertWithin(root: string, target: string): void {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error('不允许访问应用数据目录之外的路径')
  }
}
