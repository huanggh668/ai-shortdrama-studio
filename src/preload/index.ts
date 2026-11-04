import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppAPI, AppEvent } from '../shared/types'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

const api: AppAPI = {
  projects: {
    list: () => invoke(IPC.projectsList),
    create: (input) => invoke(IPC.projectsCreate, input),
    get: (id) => invoke(IPC.projectsGet, id),
    save: (project) => invoke(IPC.projectsSave, project),
    saveSync: (project) => {
      ipcRenderer.sendSync(IPC.projectsSaveSync, project)
    },
    remove: (id) => invoke(IPC.projectsRemove, id),
    duplicate: (id) => invoke(IPC.projectsDuplicate, id),
    exportBundle: (id) => invoke(IPC.projectsExportBundle, id),
    mergeSeries: (id) => invoke(IPC.projectsMergeSeries, id),
    openFolder: (id) => invoke(IPC.projectsOpenFolder, id),
    revealFile: (id, relativePath) => invoke(IPC.projectsRevealFile, id, relativePath)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    save: (settings) => invoke(IPC.settingsSave, settings),
    test: (target) => invoke(IPC.settingsTest, target),
    reset: () => invoke(IPC.settingsReset)
  },
  pipeline: {
    run: (req) => invoke(IPC.pipelineRun, req),
    cancel: (projectId) => invoke(IPC.pipelineCancel, projectId),
    regenerateShot: (req) => invoke(IPC.pipelineRegenerateShot, req)
  },
  assets: {
    pickBgm: () => invoke(IPC.assetsPickBgm),
    pickWorkflow: () => invoke(IPC.assetsPickWorkflow),
    importImage: (projectId, shotId, sourcePath) =>
      invoke(IPC.assetsImportImage, projectId, shotId, sourcePath),
    importAudio: (projectId, shotId, sourcePath) =>
      invoke(IPC.assetsImportAudio, projectId, shotId, sourcePath),
    importVideo: (projectId, shotId, sourcePath) =>
      invoke(IPC.assetsImportVideo, projectId, shotId, sourcePath),
    pickLocalFile: (kind) => invoke(IPC.assetsPickLocalFile, kind)
  },
  system: {
    info: () => invoke(IPC.systemInfo),
    openPath: (target) => invoke(IPC.systemOpenPath, target),
    revealPath: (target) => invoke(IPC.systemRevealPath, target),
    openExternal: (url) => invoke(IPC.systemOpenExternal, url)
  },
  onEvent: (callback: (event: AppEvent) => void) => {
    const listener = (_event: unknown, payload: AppEvent): void => callback(payload)
    ipcRenderer.on(IPC.event, listener)
    return () => ipcRenderer.removeListener(IPC.event, listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
