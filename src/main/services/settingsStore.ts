import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings } from '../../shared/types'
import { DEFAULT_SETTINGS, SECRET_MASK } from '../../shared/constants'
import type { VaultLike } from './keyVault'
import { deepMerge, ensureDir, readJson, writeJsonAtomic } from './utils'

const SECRET_PATHS = [
  'providers.text.apiKey',
  'providers.image.apiKey',
  'providers.image.secretKey',
  'providers.video.apiKey',
  'providers.video.secretKey',
  'providers.tts.apiKey'
]

export class SettingsStore {
  private readonly file: string
  private readonly vault: VaultLike
  private cached: AppSettings | null = null

  constructor(file: string, vault: VaultLike) {
    this.file = file
    this.vault = vault
  }

  async load(): Promise<AppSettings> {
    if (this.cached) return structuredClone(this.cached)
    const raw = await readJson<Record<string, unknown>>(this.file)
    const merged = deepMerge(structuredClone(DEFAULT_SETTINGS), raw ?? {}) as AppSettings
    for (const secretPath of SECRET_PATHS) {
      const stored = getAt(merged, secretPath) as string
      setAt(merged, secretPath, this.vault.decrypt(stored))
    }
    this.cached = merged
    return structuredClone(merged)
  }

  async getMasked(): Promise<AppSettings> {
    const settings = await this.load()
    for (const secretPath of SECRET_PATHS) {
      const value = getAt(settings, secretPath) as string
      if (value) setAt(settings, secretPath, SECRET_MASK)
    }
    return settings
  }

  async save(incoming: AppSettings): Promise<AppSettings> {
    const current = await this.load()
    const base = deepMerge(structuredClone(DEFAULT_SETTINGS), incoming) as AppSettings

    for (const secretPath of SECRET_PATHS) {
      const value = getAt(base, secretPath) as string
      if (value === SECRET_MASK) {
        setAt(base, secretPath, getAt(current, secretPath) as string)
      }
    }

    const stored = structuredClone(base)
    for (const secretPath of SECRET_PATHS) {
      const value = getAt(stored, secretPath) as string
      setAt(stored, secretPath, this.vault.encrypt(value))
    }

    await ensureDir(path.dirname(this.file))
    await writeJsonAtomic(this.file, stored)
    this.cached = base
    return this.getMasked()
  }

  async reset(): Promise<AppSettings> {
    this.cached = structuredClone(DEFAULT_SETTINGS)
    await ensureDir(path.dirname(this.file))
    await writeJsonAtomic(this.file, this.cached)
    return this.getMasked()
  }

  async replaceAll(settings: AppSettings): Promise<void> {
    this.cached = settings
    const stored = structuredClone(settings)
    for (const secretPath of SECRET_PATHS) {
      setAt(stored, secretPath, this.vault.encrypt(getAt(stored, secretPath) as string))
    }
    await ensureDir(path.dirname(this.file))
    await writeJsonAtomic(this.file, stored)
    void fs
  }
}

function getAt(target: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, target)
}

function setAt(target: unknown, dotted: string, value: unknown): void {
  const keys = dotted.split('.')
  let cursor = target as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys[keys.length - 1]] = value
}
