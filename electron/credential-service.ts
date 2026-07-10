import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ModelSettings, SaveModelSettings } from '../shared/contracts'

export interface SecretCodec {
  encrypt(value: string): string
  decrypt(value: string): string
}

interface StoredSettings {
  baseUrl: string
  model: string
  encryptedApiKey: string
}

export class CredentialService {
  constructor(private readonly filePath: string, private readonly codec: SecretCodec) {}

  save(input: SaveModelSettings): ModelSettings {
    const baseUrl = validateBaseUrl(input.baseUrl)
    const current = this.read()
    const apiKey = input.apiKey?.trim() ? this.codec.encrypt(input.apiKey.trim()) : current.encryptedApiKey
    this.write({ baseUrl, model: input.model.trim(), encryptedApiKey: apiKey })
    return this.load()
  }

  load(): ModelSettings {
    const data = this.read()
    return { baseUrl: data.baseUrl, model: data.model, hasApiKey: Boolean(data.encryptedApiKey) }
  }

  getApiKey(): string {
    const encrypted = this.read().encryptedApiKey
    return encrypted ? this.codec.decrypt(encrypted) : ''
  }

  clear(): ModelSettings {
    this.write({ baseUrl: '', model: '', encryptedApiKey: '' })
    return this.load()
  }

  private read(): StoredSettings {
    if (this.filePath === ':memory:' || !existsSync(this.filePath)) {
      return { baseUrl: '', model: '', encryptedApiKey: '' }
    }
    try {
      const value = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoredSettings>
      return { baseUrl: value.baseUrl ?? '', model: value.model ?? '', encryptedApiKey: value.encryptedApiKey ?? '' }
    } catch {
      return { baseUrl: '', model: '', encryptedApiKey: '' }
    }
  }

  private write(data: StoredSettings): void {
    if (this.filePath === ':memory:') return
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8')
  }
}

export function validateBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (!normalized) return ''
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('Base URL 格式无效')
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Base URL 必须使用 HTTPS 或 localhost')
  }
  return normalized
}
