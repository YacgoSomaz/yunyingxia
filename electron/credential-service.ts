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

export const TRUSTED_MODEL_ENDPOINTS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-flash', 'deepseek-v4-pro']
  }
} as const

export class CredentialService {
  constructor(private readonly filePath: string, private readonly codec: SecretCodec) {}

  save(input: SaveModelSettings): ModelSettings {
    const baseUrl = validateBaseUrl(input.baseUrl)
    const model = validateModel(input.model)
    const current = this.read()
    const apiKey = input.apiKey?.trim() ? this.codec.encrypt(input.apiKey.trim()) : current.encryptedApiKey
    this.write({ baseUrl, model, encryptedApiKey: apiKey })
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
  if (!normalized) return TRUSTED_MODEL_ENDPOINTS.deepseek.baseUrl
  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new Error('Base URL 格式无效')
  }
  return normalized
}

export function validateModel(value: string): string {
  const model = value.trim()
  if (!model) {
    throw new Error('请填写模型/接入点 ID')
  }
  return model
}
