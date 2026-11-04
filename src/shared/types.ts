export type AspectRatio = '9:16' | '16:9'

export type StageKey =
  | 'script'
  | 'characters'
  | 'storyboard'
  | 'images'
  | 'audio'
  | 'videos'
  | 'subtitles'
  | 'render'

export type StageStatus = 'idle' | 'running' | 'done' | 'failed' | 'stale' | 'skipped'
export type AssetStatus = 'pending' | 'running' | 'done' | 'stale' | 'failed' | 'skipped'
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface StageState {
  status: StageStatus
  progress: number
  message?: string
  error?: string
  updatedAt?: number
}

export interface AssetState {
  path?: string
  status: AssetStatus
  error?: string
}

export interface AudioAssetState extends AssetState {
  duration?: number
}

export interface Character {
  id: string
  name: string
  role: string
  description: string
  appearancePrompt: string
  personality: string
  voice: string
  portraitPath?: string
  portraitStatus: AssetStatus
}

export interface SeriesBible {
  logline: string
  synopsis: string
  tone: string
  characters: Character[]
}

export interface EpisodeOutline {
  id: string
  index: number
  title: string
  synopsis: string
  beats: string[]
}

export interface Shot {
  id: string
  episodeId: string
  no: number
  scene: string
  shotSize: string
  cameraMove: string
  duration: number
  action: string
  dialogue: string
  narration: string
  imagePrompt: string
  videoPrompt: string
  negativePrompt: string
  image: AssetState
  audio: AudioAssetState
  video: AssetState
}

export interface Episode {
  id: string
  index: number
  title: string
  synopsis: string
  beats?: string[]
  shots: Shot[]
}

export type StageMap = Record<StageKey, StageState>

export interface Project {
  schemaVersion: 1
  id: string
  title: string
  idea: string
  genre: string
  style: string
  aspect: AspectRatio
  language: 'zh'
  episodesCount: number
  episodeDuration: number
  subtitle: boolean
  titleCard: boolean
  bgmPath?: string
  bible?: SeriesBible
  episodes: Episode[]
  stages: StageMap
  exports?: Record<string, string>
  seriesExportPath?: string
  subtitles?: Record<string, { srt: string; ass: string }>
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  title: string
  idea: string
  genre: string
  aspect: AspectRatio
  coverPath?: string
  episodeCount: number
  shotCount: number
  progress: number
  createdAt: string
  updatedAt: string
}

export interface CreateProjectInput {
  title?: string
  idea: string
  genre: string
  style: string
  aspect: AspectRatio
  episodesCount: number
  episodeDuration: number
  subtitle: boolean
  titleCard: boolean
}

export interface TaskInfo {
  id: string
  projectId?: string
  kind: string
  label: string
  status: TaskStatus
  progress: number
  message?: string
  error?: string
  startedAt?: number
  finishedAt?: number
}

export type TextProviderKind = 'demo' | 'openai'
export type ImageProviderKind = 'demo' | 'openai' | 'kling' | 'comfyui'
export type VideoProviderKind = 'demo' | 'kling' | 'comfyui'
export type TtsProviderKind = 'none' | 'system' | 'openai'

export interface TextProviderSettings {
  kind: TextProviderKind
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface ImageProviderSettings {
  kind: ImageProviderKind
  baseUrl: string
  apiKey: string
  secretKey: string
  model: string
  size: string
  workflowPath: string
}

export interface VideoProviderSettings {
  kind: VideoProviderKind
  baseUrl: string
  apiKey: string
  secretKey: string
  model: string
  mode: 'std' | 'pro'
  workflowPath: string
  timeoutSec: number
}

export interface TtsProviderSettings {
  kind: TtsProviderKind
  baseUrl: string
  apiKey: string
  model: string
  voice: string
  systemVoice: string
  rate: number
}

export interface ProviderSettings {
  text: TextProviderSettings
  image: ImageProviderSettings
  video: VideoProviderSettings
  tts: TtsProviderSettings
}

export interface MediaSettings {
  imageConcurrency: number
  videoConcurrency: number
  fps: number
  burnSubtitles: boolean
  bgmVolume: number
  subtitleFont: string
}

export interface PathSettings {
  ffmpegPath: string
  ffprobePath: string
}

export interface AppSettings {
  version: 1
  demoMode: boolean
  providers: ProviderSettings
  media: MediaSettings
  paths: PathSettings
}

export type TestTarget = 'text' | 'image' | 'video' | 'tts'

export interface TestResult {
  ok: boolean
  message: string
}

export interface RunPipelineRequest {
  projectId: string
  from?: StageKey
  force?: boolean
  episodeId?: string
  shotId?: string
  stages?: StageKey[]
}

export interface RegenerateShotRequest {
  projectId: string
  shotId: string
  kind: 'image' | 'video' | 'audio'
}

export type AppEvent =
  | { type: 'project:updated'; project: Project }
  | { type: 'task:updated'; task: TaskInfo }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; projectId?: string }
  | { type: 'pipeline:done'; projectId: string; ok: boolean; error?: string }

export interface SystemInfo {
  version: string
  platform: string
  arch: string
  userData: string
  ffmpegPath: string
  ffprobePath: string
  dataDir: string
}

export interface AppAPI {
  projects: {
    list(): Promise<ProjectSummary[]>
    create(input: CreateProjectInput): Promise<Project>
    get(id: string): Promise<Project>
    save(project: Project): Promise<Project>
    saveSync(project: Project): void
    remove(id: string): Promise<void>
    duplicate(id: string): Promise<Project>
    exportBundle(id: string): Promise<string>
    mergeSeries(id: string): Promise<string>
    openFolder(id: string): Promise<void>
    revealFile(id: string, relativePath: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    test(target: TestTarget): Promise<TestResult>
    reset(): Promise<AppSettings>
  }
  pipeline: {
    run(req: RunPipelineRequest): Promise<void>
    cancel(projectId: string): Promise<void>
    regenerateShot(req: RegenerateShotRequest): Promise<void>
  }
  assets: {
    pickBgm(): Promise<string | null>
    pickWorkflow(): Promise<string | null>
    importImage(projectId: string, shotId: string, sourcePath: string): Promise<Project>
    importAudio(projectId: string, shotId: string, sourcePath: string): Promise<Project>
    importVideo(projectId: string, shotId: string, sourcePath: string): Promise<Project>
    pickLocalFile(kind: 'image' | 'audio' | 'video'): Promise<string | null>
  }
  system: {
    info(): Promise<SystemInfo>
    openPath(path: string): Promise<void>
    revealPath(path: string): Promise<void>
    openExternal(url: string): Promise<void>
  }
  onEvent(cb: (event: AppEvent) => void): () => void
}
