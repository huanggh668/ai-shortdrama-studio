import fs from 'node:fs/promises'
import path from 'node:path'
import type { TtsProviderSettings } from '../../../shared/types'
import type { MediaService } from '../media/ffmpeg'
import { ensureDir } from '../utils'
import type { ProviderTest, TtsProvider, TtsRequest } from './types'

export class OpenAiTtsProvider implements TtsProvider {
  readonly id = 'openai-tts'
  private readonly cfg: TtsProviderSettings
  private readonly media: MediaService

  constructor(cfg: TtsProviderSettings, media: MediaService) {
    this.cfg = cfg
    this.media = media
  }

  async synthesize(req: TtsRequest): Promise<{ path: string; duration: number }> {
    if (!this.cfg.apiKey) throw new Error('未配置配音服务的 API Key')
    const response = await fetch(`${this.cfg.baseUrl.replace(/\/+$/, '')}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`
      },
      body: JSON.stringify({
        model: this.cfg.model || 'tts-1',
        input: req.text,
        voice: req.voice || this.cfg.voice || 'alloy',
        response_format: 'mp3',
        speed: clampSpeed(req.rate)
      }),
      signal: req.signal
    })
    if (!response.ok) {
      throw new Error(`配音请求失败 (${response.status})：${(await response.text()).slice(0, 300)}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await ensureDir(path.dirname(req.outPath))
    const mp3Path = `${req.outPath}.tmp.mp3`
    await fs.writeFile(mp3Path, buffer)
    try {
      await this.media.toWav(mp3Path, req.outPath)
    } finally {
      await fs.rm(mp3Path, { force: true }).catch(() => undefined)
    }
    const info = await this.media.probe(req.outPath)
    return { path: req.outPath, duration: info.duration || 1 }
  }

  async test(): Promise<ProviderTest> {
    return {
      ok: Boolean(this.cfg.apiKey),
      message: this.cfg.apiKey ? '配置已保存，将在首次配音时验证额度' : '缺少 API Key'
    }
  }
}

function clampSpeed(rate?: number): number {
  if (!rate) return 1
  return Math.min(2, Math.max(0.5, 1 + rate * 0.05))
}
