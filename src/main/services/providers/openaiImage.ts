import fs from 'node:fs/promises'
import path from 'node:path'
import type { ImageProviderSettings } from '../../../shared/types'
import { ensureDir } from '../utils'
import type { ImageProvider, ImageRequest, ProviderTest } from './types'

export class OpenAiImageProvider implements ImageProvider {
  readonly id = 'openai-image'
  private readonly cfg: ImageProviderSettings

  constructor(cfg: ImageProviderSettings) {
    this.cfg = cfg
  }

  async generate(req: ImageRequest): Promise<{ path: string }> {
    if (!this.cfg.apiKey) throw new Error('未配置图像模型的 API Key')
    const size = this.cfg.size || (req.aspect === '9:16' ? '1024x1536' : '1536x1024')
    const payload: Record<string, unknown> = {
      model: this.cfg.model || 'gpt-image-1',
      prompt: req.prompt,
      n: 1,
      size
    }
    let response = await fetch(this.url('/images/generations'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...payload, response_format: 'b64_json' }),
      signal: req.signal
    })
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      response = await fetch(this.url('/images/generations'), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
        signal: req.signal
      })
    }
    if (!response.ok) {
      throw new Error(`图像模型请求失败 (${response.status})：${(await response.text()).slice(0, 400)}`)
    }
    const json = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>
    }
    const first = json.data?.[0]
    if (!first) throw new Error('图像模型没有返回结果')
    await ensureDir(path.dirname(req.outPath))
    if (first.b64_json) {
      await fs.writeFile(req.outPath, Buffer.from(first.b64_json, 'base64'))
    } else if (first.url) {
      const download = await fetch(first.url, { signal: req.signal })
      if (!download.ok) throw new Error(`下载生成图片失败 (${download.status})`)
      await fs.writeFile(req.outPath, Buffer.from(await download.arrayBuffer()))
    } else {
      throw new Error('图像模型返回格式不支持')
    }
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    try {
      const response = await fetch(this.url('/models'), { headers: this.headers() })
      if (!response.ok) {
        return { ok: false, message: `图像服务返回 ${response.status}：${(await response.text()).slice(0, 200)}` }
      }
      return { ok: true, message: '图像服务连接成功' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  private url(suffix: string): string {
    return `${this.cfg.baseUrl.replace(/\/+$/, '')}${suffix}`
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.cfg.apiKey}`
    }
  }
}
