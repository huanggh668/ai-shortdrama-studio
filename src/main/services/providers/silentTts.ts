import type { MediaService } from '../media/ffmpeg'
import { estimateSpeechSeconds } from '../utils'
import type { ProviderTest, TtsProvider, TtsRequest } from './types'

export class SilentTtsProvider implements TtsProvider {
  readonly id = 'silent-tts'
  private readonly media: MediaService

  constructor(media: MediaService) {
    this.media = media
  }

  async synthesize(req: TtsRequest): Promise<{ path: string; duration: number }> {
    const duration = Math.max(0.8, estimateSpeechSeconds(req.text))
    await this.media.silentWav(req.outPath, duration)
    return { path: req.outPath, duration }
  }

  async test(): Promise<ProviderTest> {
    return { ok: true, message: '静音配音模式：只显示字幕，不产生人声' }
  }
}
