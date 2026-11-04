import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

export function newId(prefix = ''): string {
  return prefix ? `${prefix}_${randomUUID()}` : randomUUID()
}

export function nowIso(): string {
  return new Date().toISOString()
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

export async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  const dir = path.dirname(file)
  await ensureDir(dir)
  const tmp = `${file}.${randomUUID()}.tmp`
  const text = JSON.stringify(data, null, 2)
  await fs.writeFile(tmp, text, 'utf8')
  try {
    const handle = await fs.open(tmp, 'r+')
    await handle.sync().catch(() => undefined)
    await handle.close()
  } catch {
    /* fsync is best-effort */
  }
  try {
    if (await exists(file)) {
      await fs.copyFile(file, `${file}.bak`).catch(() => undefined)
    }
    await fs.rename(tmp, file)
  } catch (firstError) {
    // Windows may briefly lock the target (antivirus / sync tools).
    // Never delete the existing file before the replacement is safely written.
    try {
      await fs.copyFile(tmp, file)
      await fs.rm(tmp, { force: true }).catch(() => undefined)
    } catch {
      await fs.rm(tmp, { force: true }).catch(() => undefined)
      throw new Error(
        `写入 ${path.basename(file)} 失败：${firstError instanceof Error ? firstError.message : String(firstError)}`
      )
    }
  }
}

export function writeJsonSyncAtomic(file: string, data: unknown): void {
  fsSync.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  fsSync.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    if (fsSync.existsSync(file)) {
      try {
        fsSync.copyFileSync(file, `${file}.bak`)
      } catch {
        /* backup is best-effort */
      }
    }
    fsSync.renameSync(tmp, file)
  } catch {
    try {
      fsSync.copyFileSync(tmp, file)
      fsSync.unlinkSync(tmp)
    } catch {
      try {
        fsSync.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      throw new Error(`写入 ${path.basename(file)} 失败`)
    }
  }
}

export function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root)
  const target = path.resolve(resolvedRoot, ...parts)
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`非法路径：${target}`)
  }
  return target
}

export function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function pickByHash<T>(list: readonly T[], seed: number, offset = 0): T {
  return list[(seed + offset) % list.length]
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function slugifyFilename(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (cleaned || 'untitled').slice(0, 60)
}

export function estimateSpeechSeconds(text: string): number {
  const clean = text.replace(/[\s，。！？、；：""''《》,.!?;:''"]/g, '')
  if (!clean) return 0
  return clamp(clean.length * 0.19 + 0.35, 0.8, 25)
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function deepMerge<T>(base: T, patch: unknown): T {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return (patch === undefined ? base : (patch as T))
  }
  if (isPlainObject(base) && isPlainObject(patch)) {
    const output: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      const current = (base as Record<string, unknown>)[key]
      output[key] = current !== undefined && isPlainObject(current) && isPlainObject(value)
        ? deepMerge(current, value)
        : value
    }
    return output as T
  }
  return (patch === undefined ? base : (patch as T))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function copyDir(source: string, target: string): Promise<void> {
  await fs.cp(source, target, { recursive: true, force: true })
}

export async function listDirs(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
