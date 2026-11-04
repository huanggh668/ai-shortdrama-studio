import { app } from 'electron'
import path from 'node:path'
import type { AppEvent } from '../shared/types'
import { KeyVault } from './services/keyVault'
import { ProjectStore } from './services/projectStore'
import { SettingsStore } from './services/settingsStore'
import { TaskQueue } from './services/taskQueue'
import { MediaService } from './services/media/ffmpeg'
import { ElectronImageRenderer } from './services/render/imageRenderer'
import { createProviderBundle } from './services/providers/registry'
import { PipelineEngine } from './services/pipeline/engine'

export interface AppServices {
  dataDir: string
  projectsDir: string
  store: ProjectStore
  settingsStore: SettingsStore
  tasks: TaskQueue
  media: MediaService
  renderer: ElectronImageRenderer
  pipeline: PipelineEngine
  broadcast: (event: AppEvent) => void
  init(): Promise<void>
  dispose(): void
}

export function createServices(broadcast: (event: AppEvent) => void): AppServices {
  const dataDir = app.getPath('userData')
  const projectsDir = path.join(dataDir, 'projects')
  const store = new ProjectStore(projectsDir)
  const settingsStore = new SettingsStore(path.join(dataDir, 'settings.json'), new KeyVault())
  const tasks = new TaskQueue(broadcast)
  const media = new MediaService()
  const renderer = new ElectronImageRenderer()
  const pipeline = new PipelineEngine({
    store,
    tasks,
    media,
    imageRenderer: renderer,
    getSettings: () => settingsStore.load(),
    makeProviders: (settings) => createProviderBundle(settings, media, renderer),
    emit: broadcast
  })

  return {
    dataDir,
    projectsDir,
    store,
    settingsStore,
    tasks,
    media,
    renderer,
    pipeline,
    broadcast,
    async init(): Promise<void> {
      await store.init()
      const settings = await settingsStore.load()
      media.configure(settings.paths)
    },
    dispose(): void {
      renderer.dispose()
    }
  }
}
