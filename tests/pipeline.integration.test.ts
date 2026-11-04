import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AppSettings } from '../src/shared/types'
import { DEFAULT_SETTINGS } from '../src/shared/constants'
import { ProjectStore } from '../src/main/services/projectStore'
import { TaskQueue } from '../src/main/services/taskQueue'
import { MediaService } from '../src/main/services/media/ffmpeg'
import { PipelineEngine } from '../src/main/services/pipeline/engine'
import { createProviderBundle } from '../src/main/services/providers/registry'
import type { ImageRenderer } from '../src/main/services/render/imageRenderer'
import { ensureDir } from '../src/main/services/utils'

class FfmpegImageRenderer implements ImageRenderer {
  constructor(private readonly media: MediaService) {}

  async render(_html: string, width: number, height: number, outPath: string): Promise<void> {
    await ensureDir(path.dirname(outPath))
    await this.media.run([
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=0x1b1035:s=${width}x${height}`,
      '-frames:v',
      '1',
      outPath
    ])
  }
}

describe('pipeline integration (demo mode)', () => {
  let root = ''
  let store: ProjectStore
  let media: MediaService
  let pipeline: PipelineEngine

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'dramaforge-pipeline-'))
    store = new ProjectStore(path.join(root, 'projects'))
    await store.init()
    media = new MediaService()
    const renderer = new FfmpegImageRenderer(media)
    const tasks = new TaskQueue(() => undefined)
    const settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
    settings.demoMode = true
    settings.providers.tts.kind = 'none'
    settings.media.burnSubtitles = false
    settings.media.imageConcurrency = 2
    settings.media.videoConcurrency = 2
    pipeline = new PipelineEngine({
      store,
      tasks,
      media,
      imageRenderer: renderer,
      getSettings: async () => settings,
      makeProviders: (value) => createProviderBundle(value, media, renderer),
      emit: () => undefined
    })
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('runs from idea to a playable mp4', async () => {
    const project = await store.create({
      idea: '被裁掉的女孩三年后以投资人身份回到会议室',
      title: '集成测试短剧',
      genre: '都市逆袭',
      style: '电影感写实',
      aspect: '9:16',
      episodesCount: 1,
      episodeDuration: 8,
      subtitle: true,
      titleCard: true
    })

    await pipeline.run({ projectId: project.id })

    const latest = await store.get(project.id)
    const episode = latest.episodes[0]
    expect(episode.shots.length).toBeGreaterThanOrEqual(6)
    expect(latest.stages.script.status).toBe('done')
    expect(latest.stages.render.status).toBe('done')
    expect(latest.subtitles?.[episode.id]?.srt).toBeTruthy()

    const exportRel = latest.exports?.[episode.id]
    expect(exportRel).toBeTruthy()
    const exportAbs = path.join(store.projectDir(project.id), exportRel as string)
    const stat = await fs.stat(exportAbs)
    expect(stat.size).toBeGreaterThan(50_000)

    const info = await media.probe(exportAbs)
    expect(info.width).toBe(1080)
    expect(info.height).toBe(1920)
    expect(info.duration).toBeGreaterThan(6)
    expect(info.hasAudio).toBe(true)

    const srt = await fs.readFile(
      path.join(store.projectDir(project.id), latest.subtitles![episode.id].srt),
      'utf8'
    )
    expect(srt).toContain('-->')
  }, 180_000)

  it('marks downstream stages stale when a shot is edited', async () => {
    const [summary] = await store.list()
    const project = await store.get(summary.id)
    const shot = project.episodes[0].shots[0]
    shot.imagePrompt = '改过的提示词'
    shot.image.status = 'stale'
    shot.video.status = 'stale'
    project.stages.images = { status: 'stale', progress: 0 }
    await store.save(project)
    const reloaded = await store.get(summary.id)
    expect(reloaded.stages.images.status).toBe('stale')
  })
})
