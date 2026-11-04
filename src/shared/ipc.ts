export const IPC = {
  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsGet: 'projects:get',
  projectsSave: 'projects:save',
  projectsSaveSync: 'projects:save-sync',
  projectsRemove: 'projects:remove',
  projectsDuplicate: 'projects:duplicate',
  projectsExportBundle: 'projects:export-bundle',
  projectsMergeSeries: 'projects:merge-series',
  projectsOpenFolder: 'projects:open-folder',
  projectsRevealFile: 'projects:reveal-file',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsTest: 'settings:test',
  settingsReset: 'settings:reset',

  pipelineRun: 'pipeline:run',
  pipelineCancel: 'pipeline:cancel',
  pipelineRegenerateShot: 'pipeline:regenerate-shot',

  assetsPickBgm: 'assets:pick-bgm',
  assetsPickWorkflow: 'assets:pick-workflow',
  assetsImportImage: 'assets:import-image',
  assetsImportAudio: 'assets:import-audio',
  assetsImportVideo: 'assets:import-video',
  assetsPickLocalFile: 'assets:pick-local-file',

  systemInfo: 'system:info',
  systemOpenPath: 'system:open-path',
  systemRevealPath: 'system:reveal-path',
  systemOpenExternal: 'system:open-external',

  event: 'app:event'
} as const

export const ASSET_PROTOCOL = 'drama-asset'
