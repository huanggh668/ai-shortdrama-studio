import { safeStorage } from 'electron'

export interface VaultLike {
  available(): boolean
  encrypt(value: string): string
  decrypt(value: string): string
}

export class KeyVault implements VaultLike {
  available(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  encrypt(value: string): string {
    if (!value) return ''
    if (value.startsWith('enc:') || value.startsWith('plain:')) return value
    if (this.available()) {
      return `enc:${safeStorage.encryptString(value).toString('base64')}`
    }
    throw new Error(
      '当前系统的安全存储（safeStorage）不可用，为避免 API Key 以明文落盘，已拒绝保存。'
    )
  }

  decrypt(value: string): string {
    if (!value) return ''
    try {
      if (value.startsWith('enc:')) {
        return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
      }
      if (value.startsWith('plain:')) {
        return Buffer.from(value.slice(6), 'base64').toString('utf8')
      }
      return value
    } catch {
      return ''
    }
  }
}

export class MemoryVault implements VaultLike {
  available(): boolean {
    return true
  }

  encrypt(value: string): string {
    return value ? `plain:${Buffer.from(value, 'utf8').toString('base64')}` : ''
  }

  decrypt(value: string): string {
    if (!value) return ''
    if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8')
    return value
  }
}
