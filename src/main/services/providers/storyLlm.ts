import { z } from 'zod'
import { extractJson } from '../pipeline/json'
import { buildBiblePrompt, buildShotsPrompt, storySystemPrompt } from '../pipeline/prompts'
import {
  bibleSchema,
  shotsSchema,
  zodIssues,
  type BibleResult,
  type RawShot,
  type ShotsRequest,
  type StoryEngine,
  type StoryProjectInput,
  type TextProvider
} from './types'

export class LlmStoryEngine implements StoryEngine {
  readonly id = 'llm'
  readonly isDemo = false
  private readonly text: TextProvider

  constructor(text: TextProvider) {
    this.text = text
  }

  async createBible(input: StoryProjectInput, signal?: AbortSignal): Promise<BibleResult> {
    const parsed = await this.request(buildBiblePrompt(input), bibleSchema, signal)
    const outlines = (parsed.episodes ?? []).map((episode, index) => ({
      title: episode.title || `第 ${index + 1} 集`,
      synopsis: episode.synopsis,
      beats: episode.beats
    }))
    while (outlines.length < Math.max(1, input.episodesCount)) {
      const last = outlines[outlines.length - 1]
      outlines.push({
        title: `第 ${outlines.length + 1} 集`,
        synopsis: last?.synopsis ?? input.idea,
        beats: last?.beats ?? []
      })
    }
    return {
      logline: parsed.logline || input.idea,
      synopsis: parsed.synopsis || input.idea,
      tone: parsed.tone || '',
      characters: parsed.characters.slice(0, 6),
      outlines: outlines.slice(0, Math.max(1, input.episodesCount))
    }
  }

  async createShots(input: ShotsRequest, signal?: AbortSignal): Promise<RawShot[]> {
    const parsed = await this.request(buildShotsPrompt(input), shotsSchema, signal)
    return parsed.shots.slice(0, 16)
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    return this.text.test()
  }

  private async request<T>(
    prompt: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError = '未知错误'
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const repair = attempt === 0
        ? ''
        : `\n\n上一次输出无效：${lastError}\n请严格按要求只输出合法 JSON，不要任何解释。`
      const output = await this.text.complete({
        system: storySystemPrompt(),
        prompt: prompt + repair,
        json: true,
        temperature: 0.8,
        signal
      })
      try {
        return schema.parse(extractJson(output))
      } catch (error) {
        lastError = zodIssues(error)
      }
    }
    throw new Error(`编剧模型输出无法解析：${lastError}`)
  }
}
