import { app } from 'electron'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AppSettings } from '../shared/types'
import { DEFAULT_SETTINGS } from '../shared/constants'
import { ProjectStore } from './services/projectStore'
import { TaskQueue } from './services/taskQueue'
import { MediaService } from './services/media/ffmpeg'
import { ElectronImageRenderer } from './services/render/imageRenderer'
import { createProviderBundle } from './services/providers/registry'
import { PipelineEngine } from './services/pipeline/engine'

export async function runSmokeTest(): Promise<number> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dramaforge-smoke-'))
  const renderer = new ElectronImageRenderer()
  try {
    const store = new ProjectStore(path.join(root, 'projects'))
    await store.init()
    const media = new MediaService()
    const tasks = new TaskQueue(() => undefined)
    const settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
    settings.demoMode = true
    settings.providers.tts.kind =
      process.env.DRAMAFORGE_SMOKE_TTS === 'system' ? 'system' : 'none'
    settings.media.burnSubtitles = true

    const pipeline = new PipelineEngine({
      store,
      tasks,
      media,
      imageRenderer: renderer,
      getSettings: async () => settings,
      makeProviders: (value) => createProviderBundle(value, media, renderer),
      emit: (event) => {
        if (event.type === 'log') process.stdout.write(`[log] ${event.level}: ${event.message}\n`)
        if (event.type === 'pipeline:done') process.stdout.write(`[pipeline] ${JSON.stringify(event)}\n`)
      }
    })

    const project = await store.create({
      idea: '被公司恶意裁员的女孩，三年后以投资人身份回到会议室，当众揭穿构陷她的上司。',
      title: '冒烟测试短剧',
      genre: '都市逆袭',
      style: '电影感写实',
      aspect: '9:16',
      episodesCount: 1,
      episodeDuration: 10,
      subtitle: true,
      titleCard: true
    })

    const started = Date.now()
    await pipeline.run({ projectId: project.id })
    const latest = await store.get(project.id)
    const episode = latest.episodes[0]
    const exportRel = latest.exports?.[episode.id]
    if (!exportRel) throw new Error('流水线结束但没有成片')
    const exportAbs = path.join(store.projectDir(project.id), exportRel)
    const info = await media.probe(exportAbs)
    if (info.duration < 5) throw new Error(`成片时长短于预期：${info.duration}s`)
    const result = {
      ok: true,
      output: exportAbs,
      duration: Number(info.duration.toFixed(2)),
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      shots: episode.shots.length,
      images: episode.shots.filter((shot) => shot.image.status === 'done').length,
      videos: episode.shots.filter((shot) => shot.video.status === 'done').length,
      elapsedSec: Math.round((Date.now() - started) / 1000),
      version: app.getVersion()
    }
    process.stdout.write(`SMOKE_OK ${JSON.stringify(result)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(
      `SMOKE_FAIL ${error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)}\n`
    )
    return 1
  } finally {
    renderer.dispose()
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}
