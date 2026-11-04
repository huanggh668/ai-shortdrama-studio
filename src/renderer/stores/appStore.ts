import { create } from 'zustand'
import type {
  AppEvent,
  AppSettings,
  Character,
  CreateProjectInput,
  Episode,
  Project,
  ProjectSummary,
  Shot,
  StageKey,
  TaskInfo,
  TestResult,
  TestTarget
} from '@shared/types'
import { api } from '@/lib/api'
import { errorText } from '@/lib/format'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error'
  message: string
}

export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error'
  message: string
  projectId?: string
  at: number
}

interface AppState {
  ready: boolean
  projects: ProjectSummary[]
  project: Project | null
  settings: AppSettings | null
  tasks: TaskInfo[]
  logs: LogEntry[]
  toasts: Toast[]
  dirty: boolean
  init(): Promise<void>
  refreshProjects(): Promise<void>
  createProject(input: CreateProjectInput): Promise<Project>
  openProject(id: string): Promise<void>
  closeProject(): Promise<void>
  mutate(mutator: (draft: Project) => void): void
  saveNow(): Promise<void>
  updateShot(shotId: string, patch: Partial<Shot>): void
  addShot(episodeId: string): void
  deleteShot(shotId: string): void
  moveShot(shotId: string, direction: -1 | 1): void
  updateCharacter(id: string, patch: Partial<Character>): void
  updateEpisode(id: string, patch: Partial<Episode>): void
  runPipeline(options?: { from?: StageKey; force?: boolean; stages?: StageKey[] }): Promise<void>
  regenerateShot(shotId: string, kind: 'image' | 'audio' | 'video'): Promise<void>
  cancelPipeline(): Promise<void>
  saveSettings(settings: AppSettings): Promise<AppSettings | null>
  testProvider(target: TestTarget, draft?: AppSettings): Promise<TestResult>
  notify(type: Toast['type'], message: string): void
  dismissToast(id: string): void
  applyEvent(event: AppEvent): void
}

let initialized = false
let unloadRegistered = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let editVersion = 0
let saveChain: Promise<void> = Promise.resolve()

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void useAppStore.getState().saveNow()
  }, 700)
}

function touchStages(project: Project, stages: StageKey[]): void {
  for (const stage of stages) {
    project.stages[stage] = {
      ...project.stages[stage],
      status: 'stale',
      progress: 0,
      updatedAt: Date.now()
    }
  }
}

function findShot(project: Project, shotId: string): { episode: Episode; shot: Shot } | null {
  for (const episode of project.episodes) {
    const shot = episode.shots.find((item) => item.id === shotId)
    if (shot) return { episode, shot }
  }
  return null
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  projects: [],
  project: null,
  settings: null,
  tasks: [],
  logs: [],
  toasts: [],
  dirty: false,

  async init() {
    if (initialized) return
    initialized = true
    api.onEvent((event) => get().applyEvent(event))
    if (!unloadRegistered) {
      unloadRegistered = true
      window.addEventListener('beforeunload', () => {
        const state = useAppStore.getState()
        if (state.project && state.dirty) {
          try {
            api.projects.saveSync(state.project)
          } catch {
            /* last-chance save; cannot surface UI during unload */
          }
        }
      })
    }
    try {
      const [settings, projects] = await Promise.all([api.settings.get(), api.projects.list()])
      set({ settings, projects, ready: true })
    } catch (error) {
      set({ ready: true })
      get().notify('error', `初始化失败：${errorText(error)}`)
    }
  },

  async refreshProjects() {
    try {
      set({ projects: await api.projects.list() })
    } catch {
      /* ignore */
    }
  },

  async createProject(input) {
    const project = await api.projects.create(input)
    set({ project, dirty: false })
    await get().refreshProjects()
    return project
  },

  async openProject(id) {
    await get().saveNow()
    const project = await api.projects.get(id)
    set({ project, dirty: false })
  },

  async closeProject() {
    await get().saveNow()
    set({ project: null, dirty: false })
    void get().refreshProjects()
  },

  mutate(mutator) {
    const current = get().project
    if (!current) return
    const busy = get().tasks.some(
      (task) =>
        task.projectId === current.id && (task.status === 'running' || task.status === 'queued')
    )
    if (busy) {
      get().notify('info', '正在生成，完成后再编辑，避免覆盖当前进度')
      return
    }
    const draft = structuredClone(current)
    mutator(draft)
    editVersion += 1
    set({ project: draft, dirty: true })
    scheduleSave()
  },

  async saveNow() {
    const state = get()
    if (!state.project || !state.dirty) return
    const snapshot = structuredClone(state.project)
    const version = editVersion
    saveChain = saveChain
      .catch(() => undefined)
      .then(async () => {
        try {
          await api.projects.save(snapshot)
          if (editVersion === version) set({ dirty: false })
        } catch (error) {
          get().notify('error', `保存失败：${errorText(error)}`)
        }
      })
    await saveChain
  },

  updateShot(shotId, patch) {
    const state = get()
    if (!state.project) return
    const found = findShot(state.project, shotId)
    if (!found) return
    const before = found.shot
    const imageFields: Array<keyof Shot> = [
      'scene',
      'shotSize',
      'cameraMove',
      'action',
      'imagePrompt',
      'negativePrompt'
    ]
    const audioFields: Array<keyof Shot> = ['dialogue', 'narration']
    const imageChanged = imageFields.some(
      (key) => key in patch && patch[key] !== before[key]
    )
    const audioChanged = audioFields.some(
      (key) => key in patch && patch[key] !== before[key]
    )
    const durationChanged = patch.duration !== undefined && patch.duration !== before.duration

    get().mutate((draft) => {
      const target = findShot(draft, shotId)
      if (!target) return
      Object.assign(target.shot, patch)
      if (imageChanged) {
        if (target.shot.image.path) target.shot.image.status = 'stale'
        if (target.shot.video.path) target.shot.video.status = 'stale'
        touchStages(draft, ['images', 'videos', 'render'])
      }
      if (audioChanged) {
        if (target.shot.audio.path) target.shot.audio.status = 'stale'
        if (target.shot.video.path) target.shot.video.status = 'stale'
        touchStages(draft, ['audio', 'videos', 'subtitles', 'render'])
      }
      if (durationChanged) {
        if (target.shot.video.path) target.shot.video.status = 'stale'
        touchStages(draft, ['videos', 'subtitles', 'render'])
      }
    })
  },

  addShot(episodeId) {
    get().mutate((draft) => {
      const episode = draft.episodes.find((item) => item.id === episodeId)
      if (!episode) return
      const no = episode.shots.length + 1
      episode.shots.push({
        id: crypto.randomUUID(),
        episodeId,
        no,
        scene: '新场景',
        shotSize: '中景',
        cameraMove: '固定',
        duration: 3,
        action: '',
        dialogue: '',
        narration: '',
        imagePrompt: '',
        videoPrompt: '',
        negativePrompt: '',
        image: { status: 'pending' },
        audio: { status: 'pending' },
        video: { status: 'pending' }
      })
      touchStages(draft, ['images', 'audio', 'videos', 'subtitles', 'render'])
    })
  },

  deleteShot(shotId) {
    get().mutate((draft) => {
      for (const episode of draft.episodes) {
        const index = episode.shots.findIndex((shot) => shot.id === shotId)
        if (index >= 0) {
          episode.shots.splice(index, 1)
          episode.shots.forEach((shot, i) => {
            shot.no = i + 1
          })
          touchStages(draft, ['subtitles', 'render'])
          return
        }
      }
    })
  },

  moveShot(shotId, direction) {
    get().mutate((draft) => {
      for (const episode of draft.episodes) {
        const index = episode.shots.findIndex((shot) => shot.id === shotId)
        if (index >= 0) {
          const target = index + direction
          if (target < 0 || target >= episode.shots.length) return
          const [item] = episode.shots.splice(index, 1)
          episode.shots.splice(target, 0, item)
          episode.shots.forEach((shot, i) => {
            shot.no = i + 1
          })
          touchStages(draft, ['subtitles', 'render'])
          return
        }
      }
    })
  },

  updateCharacter(id, patch) {
    get().mutate((draft) => {
      const character = draft.bible?.characters.find((item) => item.id === id)
      if (!character) return
      const visualChanged =
        patch.appearancePrompt !== undefined ||
        patch.description !== undefined ||
        patch.name !== undefined
      Object.assign(character, patch)
      if (visualChanged) {
        character.portraitStatus = character.portraitPath ? 'stale' : 'pending'
        for (const episode of draft.episodes) {
          for (const shot of episode.shots) {
            if (shot.image.path) shot.image.status = 'stale'
            if (shot.video.path) shot.video.status = 'stale'
          }
        }
        touchStages(draft, ['characters', 'images', 'videos', 'render'])
      }
    })
  },

  updateEpisode(id, patch) {
    get().mutate((draft) => {
      const episode = draft.episodes.find((item) => item.id === id)
      if (!episode) return
      Object.assign(episode, patch)
      touchStages(draft, ['storyboard'])
    })
  },

  async runPipeline(options = {}) {
    const project = get().project
    if (!project) return
    await get().saveNow()
    try {
      await api.pipeline.run({
        projectId: project.id,
        from: options.from,
        force: options.force,
        stages: options.stages
      })
    } catch (error) {
      get().notify('error', errorText(error))
    }
  },

  async regenerateShot(shotId, kind) {
    const project = get().project
    if (!project) return
    await get().saveNow()
    try {
      await api.pipeline.regenerateShot({ projectId: project.id, shotId, kind })
    } catch (error) {
      get().notify('error', errorText(error))
    }
  },

  async cancelPipeline() {
    const project = get().project
    if (!project) return
    await api.pipeline.cancel(project.id)
  },

  async saveSettings(settings) {
    try {
      const saved = await api.settings.save(settings)
      set({ settings: saved })
      get().notify('success', '设置已保存')
      return saved
    } catch (error) {
      get().notify('error', `保存设置失败：${errorText(error)}`)
      return null
    }
  },

  async testProvider(target, draft) {
    try {
      if (draft) {
        const saved = await api.settings.save(draft)
        set({ settings: saved })
      }
      return await api.settings.test(target)
    } catch (error) {
      return { ok: false, message: errorText(error) }
    }
  },

  notify(type, message) {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => get().dismissToast(id), 4800)
  },

  dismissToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
  },

  applyEvent(event) {
    if (event.type === 'project:updated') {
      const state = get()
      if (state.project?.id === event.project.id && !state.dirty) {
        set({ project: event.project })
      }
      return
    }
    if (event.type === 'task:updated') {
      set((state) => {
        const tasks = state.tasks.some((task) => task.id === event.task.id)
          ? state.tasks.map((task) => (task.id === event.task.id ? event.task : task))
          : [event.task, ...state.tasks]
        tasks.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
        return { tasks: tasks.slice(0, 24) }
      })
      return
    }
    if (event.type === 'log') {
      const entry: LogEntry = {
        id: crypto.randomUUID(),
        level: event.level,
        message: event.message,
        projectId: event.projectId,
        at: Date.now()
      }
      set((state) => ({ logs: [entry, ...state.logs].slice(0, 200) }))
      if (event.level === 'error') get().notify('error', event.message)
      return
    }
    if (event.type === 'pipeline:done') {
      if (event.ok) get().notify('success', '生成完成，成片已更新')
      else if (event.error && event.error !== '已取消') get().notify('error', event.error)
      void get().refreshProjects()
    }
  }
}))
