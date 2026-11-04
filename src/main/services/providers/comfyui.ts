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

interface ComfyFile {
  filename: string
  subfolder?: string
  type?: string
}

type TokenValue = string | number

const TOKEN_PATTERN = /__[A-Z_]+__/g

function injectTokens(value: unknown, tokens: Record<string, TokenValue>): unknown {
  if (Array.isArray(value)) return value.map((item) => injectTokens(item, tokens))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      output[key] = injectTokens(item, tokens)
    }
    return output
  }
  if (typeof value === 'string') {
    if (tokens[value] !== undefined) return tokens[value]
    return value.replace(TOKEN_PATTERN, (match) =>
      tokens[match] !== undefined ? String(tokens[match]) : match
    )
  }
  return value
}

async function loadWorkflow(file: string): Promise<Record<string, unknown>> {
  if (!file) throw new Error('请先在设置中选择 ComfyUI 工作流 JSON 文件')
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    throw new Error(`无法读取工作流文件：${file}`)
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('工作流文件不是合法 JSON')
  }
}

async function submitWorkflow(
  baseUrl: string,
  workflow: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: `dramaforge-${Date.now()}` }),
    signal
  })
  const json = (await response.json().catch(() => ({}))) as {
    prompt_id?: string
    error?: { message?: string }
    node_errors?: Record<string, unknown>
  }
  if (!response.ok || !json.prompt_id) {
    throw new Error(
      `ComfyUI 提交失败：${json.error?.message ?? response.statusText}${
        json.node_errors ? ` ${JSON.stringify(json.node_errors).slice(0, 300)}` : ''
      }`
    )
  }
  return json.prompt_id
}

async function waitForOutputs(
  baseUrl: string,
  promptId: string,
  timeoutSec: number,
  signal?: AbortSignal
): Promise<ComfyFile[]> {
  const deadline = Date.now() + Math.max(60, timeoutSec) * 1000
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/history/${promptId}`, { signal })
    if (!response.ok) {
      throw new Error(`ComfyUI 查询任务失败 (${response.status})：${(await response.text()).slice(0, 300)}`)
    }
    const json = (await response.json().catch(() => ({}))) as Record<
      string,
      { outputs?: Record<string, { images?: ComfyFile[]; gifs?: ComfyFile[]; videos?: ComfyFile[] }> }
    >
    const entry = json[promptId]
    if (entry?.outputs) {
      const files: ComfyFile[] = []
      for (const output of Object.values(entry.outputs)) {
        files.push(...(output.images ?? []), ...(output.gifs ?? []), ...(output.videos ?? []))
      }
      if (files.length > 0) return files
    }
    await sleep(2000)
  }
  throw new Error('ComfyUI 任务超时')
}

async function downloadOutput(
  baseUrl: string,
  file: ComfyFile,
  outPath: string,
  signal?: AbortSignal
): Promise<void> {
  const query = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? '',
    type: file.type ?? 'output'
  })
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/view?${query.toString()}`, { signal })
  if (!response.ok) throw new Error(`下载 ComfyUI 结果失败 (${response.status})`)
  await ensureDir(path.dirname(outPath))
  await fs.writeFile(outPath, Buffer.from(await response.arrayBuffer()))
}

async function uploadInputImage(baseUrl: string, imagePath: string): Promise<string> {
  const data = await fs.readFile(imagePath)
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(data)]), path.basename(imagePath))
  form.append('overwrite', 'true')
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/upload/image`, {
    method: 'POST',
    body: form
  })
  const json = (await response.json().catch(() => ({}))) as { name?: string }
  if (!response.ok || !json.name) throw new Error('ComfyUI 上传关键帧失败')
  return json.name
}

async function testComfy(baseUrl: string): Promise<ProviderTest> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/system_stats`)
    if (!response.ok) return { ok: false, message: `ComfyUI 返回 ${response.status}` }
    return { ok: true, message: 'ComfyUI 连接成功' }
  } catch (error) {
    return {
      ok: false,
      message: `无法连接 ComfyUI：${error instanceof Error ? error.message : String(error)}`
    }
  }
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp']
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.gif', '.webp']

function pickOutput(files: ComfyFile[], kind: 'image' | 'video'): ComfyFile {
  const allowed = kind === 'image' ? IMAGE_EXTS : VIDEO_EXTS
  const matched = files.find((file) => allowed.includes(path.extname(file.filename).toLowerCase()))
  return matched ?? files[0]
}

export class ComfyImageProvider implements ImageProvider {
  readonly id = 'comfyui-image'
  private readonly cfg: ImageProviderSettings

  constructor(cfg: ImageProviderSettings) {
    this.cfg = cfg
  }

  async generate(req: ImageRequest): Promise<{ path: string }> {
    const workflow = await loadWorkflow(this.cfg.workflowPath)
    const seed = req.seed ?? Math.floor(Math.random() * 1_000_000_000)
    const injected = injectTokens(workflow, {
      __PROMPT__: req.prompt,
      __NEGATIVE__: req.negativePrompt ?? '',
      __SEED__: seed,
      __WIDTH__: req.width,
      __HEIGHT__: req.height
    }) as Record<string, unknown>
    const promptId = await submitWorkflow(this.cfg.baseUrl, injected, req.signal)
    const files = await waitForOutputs(this.cfg.baseUrl, promptId, 600, req.signal)
    await downloadOutput(this.cfg.baseUrl, pickOutput(files, 'image'), req.outPath, req.signal)
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    return testComfy(this.cfg.baseUrl)
  }
}

export class ComfyVideoProvider implements VideoProvider {
  readonly id = 'comfyui-video'
  private readonly cfg: VideoProviderSettings

  constructor(cfg: VideoProviderSettings) {
    this.cfg = cfg
  }

  async generate(req: VideoRequest): Promise<{ path: string }> {
    if (!req.imagePath) throw new Error('ComfyUI 图生视频需要关键帧')
    const workflow = await loadWorkflow(this.cfg.workflowPath)
    const uploaded = await uploadInputImage(this.cfg.baseUrl, req.imagePath)
    const seed = req.seed ?? Math.floor(Math.random() * 1_000_000_000)
    const injected = injectTokens(workflow, {
      __PROMPT__: req.prompt,
      __NEGATIVE__: req.negativePrompt ?? '',
      __SEED__: seed,
      __WIDTH__: req.width,
      __HEIGHT__: req.height,
      __IMAGE__: uploaded,
      __DURATION__: req.duration
    }) as Record<string, unknown>
    const promptId = await submitWorkflow(this.cfg.baseUrl, injected, req.signal)
    const files = await waitForOutputs(
      this.cfg.baseUrl,
      promptId,
      this.cfg.timeoutSec || 900,
      req.signal
    )
    await downloadOutput(this.cfg.baseUrl, pickOutput(files, 'video'), req.outPath, req.signal)
    return { path: req.outPath }
  }

  async test(): Promise<ProviderTest> {
    return testComfy(this.cfg.baseUrl)
  }
}
