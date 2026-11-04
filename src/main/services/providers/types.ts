import { z } from 'zod'

export interface RawCharacter {
  name: string
  role: string
  description: string
  appearancePrompt: string
  personality: string
  voice: string
}

export interface RawShot {
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
}

export interface StoryProjectInput {
  title: string
  idea: string
  genre: string
  style: string
  aspect: string
  episodesCount: number
  episodeDuration: number
}

export interface OutlineDraft {
  title: string
  synopsis: string
  beats: string[]
}

export interface BibleResult {
  logline: string
  synopsis: string
  tone: string
  characters: RawCharacter[]
  outlines: OutlineDraft[]
}

export interface ShotsRequest {
  project: StoryProjectInput
  bible: {
    logline: string
    synopsis: string
    tone: string
    characters: RawCharacter[]
  }
  episode: OutlineDraft
  episodeIndex: number
}

export interface StoryEngine {
  readonly id: string
  readonly isDemo: boolean
  createBible(input: StoryProjectInput, signal?: AbortSignal): Promise<BibleResult>
  createShots(input: ShotsRequest, signal?: AbortSignal): Promise<RawShot[]>
  test(): Promise<{ ok: boolean; message: string }>
}

export type ProviderTest = { ok: boolean; message: string }

export interface TextRequest {
  system: string
  prompt: string
  json?: boolean
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}

export interface TextProvider {
  readonly id: string
  complete(req: TextRequest): Promise<string>
  test(): Promise<ProviderTest>
}

export interface ImageRequest {
  prompt: string
  negativePrompt?: string
  width: number
  height: number
  aspect: '9:16' | '16:9'
  outPath: string
  kind?: 'keyframe' | 'portrait' | 'title' | 'end'
  title?: string
  subtitle?: string
  body?: string
  seed?: number
  referenceImagePath?: string
  signal?: AbortSignal
}

export interface ImageProvider {
  readonly id: string
  generate(req: ImageRequest): Promise<{ path: string }>
  test(): Promise<ProviderTest>
}

export interface VideoRequest {
  imagePath?: string
  prompt: string
  negativePrompt?: string
  duration: number
  width: number
  height: number
  fps: number
  outPath: string
  seed?: number
  signal?: AbortSignal
}

export interface VideoProvider {
  readonly id: string
  generate(req: VideoRequest): Promise<{ path: string }>
  test(): Promise<ProviderTest>
}

export interface TtsRequest {
  text: string
  outPath: string
  voice?: string
  rate?: number
  signal?: AbortSignal
}

export interface TtsProvider {
  readonly id: string
  synthesize(req: TtsRequest): Promise<{ path: string; duration: number }>
  test(): Promise<ProviderTest>
}

export const rawCharacterSchema = z.object({
  name: z.string().min(1),
  role: z.string().catch('配角'),
  description: z.string().catch(''),
  appearancePrompt: z.string().catch(''),
  personality: z.string().catch(''),
  voice: z.string().catch('')
})

export const bibleSchema = z.object({
  logline: z.string().catch(''),
  synopsis: z.string().catch(''),
  tone: z.string().catch(''),
  characters: z.array(rawCharacterSchema).min(1),
  episodes: z
    .array(
      z.object({
        title: z.string().catch('未命名'),
        synopsis: z.string().catch(''),
        beats: z.array(z.string()).catch([])
      })
    )
    .min(1)
})

export const shotsSchema = z.object({
  shots: z
    .array(
      z.object({
        scene: z.string().catch('室内'),
        shotSize: z.string().catch('中景'),
        cameraMove: z.string().catch('固定'),
        duration: z.coerce.number().min(1).max(12).catch(3),
        action: z.string().catch(''),
        dialogue: z.string().catch(''),
        narration: z.string().catch(''),
        imagePrompt: z.string().catch(''),
        videoPrompt: z.string().catch(''),
        negativePrompt: z.string().catch('')
      })
    )
    .min(1)
})

export function zodIssues(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .slice(0, 6)
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ')
  }
  return error instanceof Error ? error.message : String(error)
}
