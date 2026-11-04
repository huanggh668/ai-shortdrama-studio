import { createHmac } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ImageProviderSettings, VideoProviderSettings } from '../../../shared/types'
import { ensureDir, sleep } from '../utils'
import type {
  ImageProvider,
  ImageRequest,
  ProviderTest,
  VideoProvider,
  VideoRequest
} from './types'

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

export function klingJwt(accessKey: string, secretKey: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = base64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }))
  const data = `${header}.${payload}`
  const signature = createHmac('sha256', secretKey).update(data).digest('base64url')
  return `${data}.${signature}`
}

interface KlingResponse {
  code?: number
  message?: string
  data?: Record<string, unknown>
}

async function klingRequest(
  baseUrl: string,
  jwt: string,
  method: 'GET' | 'POST',
  suffix: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${suffix}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal
  })
  const json = (await response.json().catch(() => ({}))) as KlingResponse
  if (!response.ok) {
    throw new Error(`可灵请求失败 (${response.status})：${json.message ?? response.statusText}`)
  }
  if (typeof json.code === 'number' && json.code !== 0) {
    throw new Error(`可灵返回错误 ${json.code}：${json.message ?? ''}`)
  }
  return (json.data ?? {}) as Record<string, unknown>
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  const step = 250
  let waited = 0
  while (waited < ms) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    await sleep(Math.min(step, ms - waited))
    waited += step
  }
}

async function pollTask(
  baseUrl: string,
  jwt: string,
  taskPath: string,
  timeoutSec: number,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + Math.max(60, timeoutSec) * 1000
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const data = await klingRequest(baseUrl, jwt, 'GET', taskPath, undefined, signal)
    const status = String(data.task_status ?? '')
    if (status === 'succeed') return data
    if (status === 'failed') {
      throw new Error(`可灵任务失败：${String(data.task_status_msg ?? '未知原因')}`)
    }
    await abortableSleep(4000, signal)
  }
  throw new Error('可灵任务超时')
}

async function download(url: string, outPath: string, signal?: AbortSignal): Promise<void> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`下载生成结果失败 (${response.status})`)
  await ensureDir(path.dirname(outPath))
  await fs.writeFile(outPath, Buffer.from(await response.arrayBuffer()))
}

function requireKeys(accessKey: string, secretKey: string): void {
  if (!accessKey || !secretKey) throw new Error('可灵需要同时配置 Access Key 与 Secret Key')
}

export class KlingImageProvider implements ImageProvider {
  readonly id = 'kling-image'
  private readonly cfg: ImageProviderSettings

  constructor(cfg: ImageProviderSettings) {
    this.cfg = cfg
  }

  async generate(req: ImageRequest): Promise<{ path: string }> {
    requireKeys(this.cfg.apiKey, this.cfg.secretKey)
    const jwt = klingJwt(this.cfg.apiKey, this.cfg.secretKey)
    const created = await klingRequest(
      this.cfg.baseUrl,
      jwt,
      'POST',
      '/v1/images/generations',
      {
        model_name: this.cfg.model || 'kling-v2',
        prompt: req.prompt.slice(0, 2000),
        negative_prompt: (req.negativePrompt ?? '').slice(0, 1000),
        image_num: 1,
        aspect_ratio: req.aspect
      },
      req.signal
    )
    const taskId = String(created.task_id ?? '')
    if (!taskId) throw new Error('可灵未返回任务 ID')
    const task = await pollTask(
      this.cfg.baseUrl,
      jwt,
      `/v1/images/generations/${taskId}`,
      600,
      req.signal
    )
    const result = task.task_result as { images?: Array<{ url?: string }> } | undefined
    const url = result?.images?.[0]?.url
    if (!url) throw new Error('可灵没有返回图片地址')
    await download(url, req.outPath, req.signal)
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    try {
      requireKeys(this.cfg.apiKey, this.cfg.secretKey)
      const jwt = klingJwt(this.cfg.apiKey, this.cfg.secretKey)
      const response = await fetch(
        `${this.cfg.baseUrl.replace(/\/+$/, '')}/v1/images/generations/connection-test`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      )
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Access Key / Secret Key 无效或已过期' }
      }
      return { ok: true, message: '可灵鉴权通过（任务能力将在首次生成时验证）' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
}

export class KlingVideoProvider implements VideoProvider {
  readonly id = 'kling-video'
  private readonly cfg: VideoProviderSettings

  constructor(cfg: VideoProviderSettings) {
    this.cfg = cfg
  }

  async generate(req: VideoRequest): Promise<{ path: string }> {
    requireKeys(this.cfg.apiKey, this.cfg.secretKey)
    if (!req.imagePath) throw new Error('可灵图生视频需要关键帧，请先生成画面')
    const jwt = klingJwt(this.cfg.apiKey, this.cfg.secretKey)
    const image = await fs.readFile(req.imagePath)
    const created = await klingRequest(
      this.cfg.baseUrl,
      jwt,
      'POST',
      '/v1/videos/image2video',
      {
        model_name: this.cfg.model || 'kling-v2-5-turbo',
        image: image.toString('base64'),
        prompt: req.prompt.slice(0, 2000),
        negative_prompt: (req.negativePrompt ?? '').slice(0, 1000),
        cfg_scale: 0.5,
        mode: this.cfg.mode || 'std',
        duration: req.duration > 6 ? '10' : '5'
      },
      req.signal
    )
    const taskId = String(created.task_id ?? '')
    if (!taskId) throw new Error('可灵未返回任务 ID')
    const task = await pollTask(
      this.cfg.baseUrl,
      jwt,
      `/v1/videos/image2video/${taskId}`,
      this.cfg.timeoutSec || 600,
      req.signal
    )
    const result = task.task_result as { videos?: Array<{ url?: string }> } | undefined
    const url = result?.videos?.[0]?.url
    if (!url) throw new Error('可灵没有返回视频地址')
    await download(url, req.outPath, req.signal)
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    try {
      requireKeys(this.cfg.apiKey, this.cfg.secretKey)
      const jwt = klingJwt(this.cfg.apiKey, this.cfg.secretKey)
      const response = await fetch(
        `${this.cfg.baseUrl.replace(/\/+$/, '')}/v1/videos/image2video/connection-test`,
        { headers: { Authorization: `Bearer ${jwt}` } }
      )
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Access Key / Secret Key 无效或已过期' }
      }
      return { ok: true, message: '可灵视频鉴权通过（任务能力将在首次生成时验证）' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
}
