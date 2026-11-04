import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import type {
  Character,
  Episode,
  Project,
  ProjectSummary,
  SeriesBible,
  Shot,
  StageKey,
  StageMap,
  CreateProjectInput
} from '../../shared/types'
import { STAGE_ORDER } from '../../shared/constants'
import { ensureDir, listDirs, newId, nowIso, readJson, safeJoin, slugifyFilename, writeJsonAtomic, writeJsonSyncAtomic } from './utils'

const ASSET_DIRS = ['images', 'audio', 'videos', 'exports', 'work', 'subtitles']

export function emptyStages(): StageMap {
  const stages = {} as StageMap
  for (const key of STAGE_ORDER) {
    stages[key] = { status: 'idle', progress: 0 }
  }
  return stages
}

export function createShot(episodeId: string, no: number, partial: Partial<Shot> = {}): Shot {
  return {
    id: partial.id ?? newId('shot'),
    episodeId,
    no,
    scene: partial.scene ?? '未命名场景',
    shotSize: partial.shotSize ?? '中景',
    cameraMove: partial.cameraMove ?? '固定',
    duration: partial.duration ?? 3,
    action: partial.action ?? '',
    dialogue: partial.dialogue ?? '',
    narration: partial.narration ?? '',
    imagePrompt: partial.imagePrompt ?? '',
    videoPrompt: partial.videoPrompt ?? '',
    negativePrompt: partial.negativePrompt ?? '',
    image: partial.image ?? { status: 'pending' },
    audio: partial.audio ?? { status: 'pending' },
    video: partial.video ?? { status: 'pending' }
  }
}

export function createCharacter(partial: Partial<Character> = {}): Character {
  return {
    id: partial.id ?? newId('char'),
    name: partial.name ?? '未命名角色',
    role: partial.role ?? '配角',
    description: partial.description ?? '',
    appearancePrompt: partial.appearancePrompt ?? '',
    personality: partial.personality ?? '',
    voice: partial.voice ?? '',
    portraitPath: partial.portraitPath,
    portraitStatus: partial.portraitStatus ?? 'pending'
  }
}

export class ProjectStore {
  private writeChains = new Map<string, Promise<unknown>>()
  private readonly root: string

  constructor(root: string) {
    this.root = root
  }

  get rootDir(): string {
    return this.root
  }

  projectDir(id: string): string {
    return safeJoin(this.root, id)
  }

  assetPath(projectId: string, ...parts: string[]): string {
    return safeJoin(this.projectDir(projectId), 'assets', ...parts)
  }

  async init(): Promise<void> {
    await ensureDir(this.root)
  }

  async list(): Promise<ProjectSummary[]> {
    const dirs = await listDirs(this.root)
    const summaries: ProjectSummary[] = []
    for (const dir of dirs) {
      const project = await readJson<Project>(path.join(this.root, dir, 'project.json'))
      if (!project || project.schemaVersion !== 1) continue
      summaries.push(summarize(project))
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const id = newId()
    const title = input.title?.trim() || deriveTitle(input.idea)
    const project: Project = {
      schemaVersion: 1,
      id,
      title,
      idea: input.idea.trim(),
      genre: input.genre,
      style: input.style,
      aspect: input.aspect,
      language: 'zh',
      episodesCount: input.episodesCount,
      episodeDuration: input.episodeDuration,
      subtitle: input.subtitle,
      titleCard: input.titleCard,
      episodes: [],
      stages: emptyStages(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    const dir = this.projectDir(id)
    await ensureDir(dir)
    for (const assetDir of ASSET_DIRS) {
      await ensureDir(path.join(dir, 'assets', assetDir))
    }
    await writeJsonAtomic(path.join(dir, 'project.json'), project)
    return project
  }

  async get(id: string): Promise<Project> {
    const project = await readJson<Project>(path.join(this.projectDir(id), 'project.json'))
    if (!project) throw new Error('项目不存在或已损坏')
    return normalizeProject(project, id)
  }

  async save(project: Project): Promise<Project> {
    const next: Project = { ...project, updatedAt: nowIso() }
    const previous = this.writeChains.get(project.id) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(() => writeJsonAtomic(path.join(this.projectDir(project.id), 'project.json'), next))
    this.writeChains.set(project.id, run)
    await run
    return next
  }

  saveSync(project: Project): Project {
    const next: Project = { ...project, updatedAt: nowIso() }
    writeJsonSyncAtomic(path.join(this.projectDir(project.id), 'project.json'), next)
    return next
  }

  async exists(id: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.projectDir(id), 'project.json'))
      return true
    } catch {
      return false
    }
  }

  existsSync(id: string): boolean {
    try {
      return fsSync.existsSync(path.join(this.projectDir(id), 'project.json'))
    } catch {
      return false
    }
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.projectDir(id), { recursive: true, force: true })
  }

  async duplicate(id: string): Promise<Project> {
    const project = await this.get(id)
    const copyId = newId()
    const copy: Project = {
      ...structuredClone(project),
      id: copyId,
      title: `${project.title} 副本`,
      stages: emptyStages(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
    delete copy.exports
    delete copy.seriesExportPath
    await fs.cp(this.projectDir(id), this.projectDir(copyId), { recursive: true, force: true })
    await writeJsonAtomic(path.join(this.projectDir(copyId), 'project.json'), copy)
    return copy
  }

  async exportBundle(id: string, targetDir: string): Promise<string> {
    const project = await this.get(id)
    const target = path.join(targetDir, `${slugifyFilename(project.title)}_工程包`)
    await fs.cp(this.projectDir(id), target, { recursive: true, force: true })
    return target
  }

  setStage(project: Project, stage: StageKey, patch: Partial<Project['stages'][StageKey]>): void {
    project.stages[stage] = {
      ...project.stages[stage],
      ...patch,
      updatedAt: Date.now()
    }
  }
}

function summarize(project: Project): ProjectSummary {
  const shots = project.episodes.flatMap((episode) => episode.shots)
  const done = shots.filter((shot) => shot.video.status === 'done' || shot.image.status === 'done').length
  const total = Math.max(shots.length, 1)
  const progress = Math.round((done / total) * 100)
  const cover = shots.find((shot) => shot.image.path)?.image.path
  return {
    id: project.id,
    title: project.title,
    idea: project.idea,
    genre: project.genre,
    aspect: project.aspect,
    coverPath: cover,
    episodeCount: project.episodes.length || project.episodesCount,
    shotCount: shots.length,
    progress,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  }
}

export function deriveTitle(idea: string): string {
  const text = idea.replace(/[\s，。！？、；：""''《》,.!?;:''"]/g, ' ').trim()
  if (!text) return '未命名短剧'
  return text.slice(0, 16)
}

export function normalizeProject(project: Project, id: string): Project {
  const stages = { ...emptyStages(), ...(project.stages ?? {}) }
  const episodes: Episode[] = (project.episodes ?? []).map((episode, index) => ({
    ...episode,
    index: episode.index ?? index + 1,
    shots: (episode.shots ?? []).map((shot, shotIndex) => createShot(episode.id, shotIndex + 1, shot))
  }))
  return {
    ...project,
    id,
    episodes,
    stages,
    episodesCount: project.episodesCount || episodes.length || 1,
    bible: project.bible ? normalizeBible(project.bible) : undefined
  }
}

function normalizeBible(bible: SeriesBible): SeriesBible {
  return {
    ...bible,
    characters: (bible.characters ?? []).map((character) => createCharacter(character))
  }
}
