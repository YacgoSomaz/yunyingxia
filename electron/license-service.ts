import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CommercialConfig } from './commercial-config'

export interface LicenseState {
  status: 'active' | 'expired' | 'blocked'
  activationId: string
  refreshToken: string
  deviceHash: string
  features: string[]
  expiresAt: number
  offlineGraceUntil: number
  lastCheckedAt: number
}

function epoch(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return epoch(Number(value))
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  }
  return 0
}

function responsePayload(body: Record<string, unknown>): { payload: string; signature: string } {
  const signature = String(body.signature || body.license_signature || (body.license as Record<string, unknown> | undefined)?.signature || '')
  const explicit = body.signed_payload || body.license_payload
  if (typeof explicit === 'string') return { payload: explicit, signature }
  const source = (body.license || body.data || body) as Record<string, unknown>
  const clean = { ...source }
  delete clean.signature
  delete clean.license_signature
  return { payload: JSON.stringify(clean), signature }
}

function verifySignature(config: CommercialConfig, body: Record<string, unknown>): void {
  if (!config.licensePublicKey) return
  const { payload, signature } = responsePayload(body)
  if (!signature) throw new Error('授权响应缺少签名')
  const data = Buffer.from(payload, 'utf8')
  const signatureBytes = Buffer.from(signature, 'base64')
  let verified = false
  try {
    verified = crypto.verify(null, data, config.licensePublicKey, signatureBytes)
  } catch {
    const verifier = crypto.createVerify('RSA-SHA256')
    verifier.update(data)
    verifier.end()
    verified = verifier.verify(config.licensePublicKey, signatureBytes)
  }
  if (!verified) throw new Error('授权响应签名校验失败')
}

export class LicenseService {
  private readonly config: CommercialConfig
  private readonly deviceIdPath: string
  private readonly cachePath: string

  constructor(config: CommercialConfig) {
    this.config = config
    const dataRoot = path.join(app.getPath('userData'), 'data')
    this.deviceIdPath = path.join(dataRoot, 'device-id')
    this.cachePath = path.join(dataRoot, 'license-cache.bin')
  }

  private dataDir(): string {
    const dir = path.dirname(this.cachePath)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private deviceHash(): string {
    this.dataDir()
    let deviceId = ''
    if (fs.existsSync(this.deviceIdPath)) deviceId = fs.readFileSync(this.deviceIdPath, 'utf8').trim()
    if (!deviceId) {
      deviceId = crypto.randomUUID()
      fs.writeFileSync(this.deviceIdPath, deviceId, { encoding: 'utf8', mode: 0o600 })
    }
    return crypto.createHash('sha256').update(`${this.config.appName}:${deviceId}`).digest('hex')
  }

  private readCache(): LicenseState | null {
    if (!fs.existsSync(this.cachePath)) return null
    try {
      const wrapper = JSON.parse(fs.readFileSync(this.cachePath, 'utf8')) as { encrypted?: string }
      if (!wrapper.encrypted || !safeStorage.isEncryptionAvailable()) return null
      return JSON.parse(safeStorage.decryptString(Buffer.from(wrapper.encrypted, 'base64'))) as LicenseState
    } catch {
      return null
    }
  }

  private writeCache(state: LicenseState): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统不支持安全授权缓存')
    this.dataDir()
    const encrypted = safeStorage.encryptString(JSON.stringify(state)).toString('base64')
    fs.writeFileSync(this.cachePath, JSON.stringify({ encrypted }), { encoding: 'utf8', mode: 0o600 })
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.config.licenseServerUrl}/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(String(data.detail || data.message || `授权服务 HTTP ${response.status}`))
    verifySignature(this.config, data)
    return data
  }

  private normalize(body: Record<string, unknown>, previous?: LicenseState): LicenseState {
    const source = ((body.license || body.data || body) as Record<string, unknown>) || {}
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = epoch(source.expires_at ?? body.expires_at)
    return {
      status: String(source.status ?? body.status ?? 'active') as LicenseState['status'],
      activationId: String(source.activation_id ?? body.activation_id ?? previous?.activationId ?? ''),
      refreshToken: String(source.refresh_token ?? body.refresh_token ?? previous?.refreshToken ?? ''),
      deviceHash: this.deviceHash(),
      features: Array.isArray(source.features ?? body.features) ? (source.features ?? body.features) as string[] : [],
      expiresAt,
      offlineGraceUntil: epoch(source.offline_grace_until ?? body.offline_grace_until) || now + this.config.offlineGraceHours * 3600,
      lastCheckedAt: now,
    }
  }

  async activate(cardKey: string): Promise<LicenseState> {
    const key = String(cardKey || '').trim()
    if (key.length < 4 || key.length > 128) throw new Error('卡密格式无效')
    const body = await this.post('activate', { card_key: key, device_hash: this.deviceHash(), app_version: this.config.version })
    const state = this.normalize(body)
    if (state.status !== 'active' || !state.activationId || !state.refreshToken) throw new Error('授权服务返回的授权状态无效')
    this.writeCache(state)
    return state
  }

  async refresh(state: LicenseState): Promise<LicenseState> {
    const body = await this.post('refresh', {
      activation_id: state.activationId,
      refresh_token: state.refreshToken,
      device_hash: this.deviceHash(),
      app_version: this.config.version,
    })
    const refreshed = this.normalize(body, state)
    this.writeCache(refreshed)
    return refreshed
  }

  async ensureAuthorized(): Promise<LicenseState | null> {
    if (!this.config.commercial) return null
    const cached = this.readCache()
    const now = Math.floor(Date.now() / 1000)
    if (cached?.status === 'active' && (!cached.expiresAt || cached.expiresAt > now)) {
      if (now - cached.lastCheckedAt < 12 * 3600) return cached
      try {
        return await this.refresh(cached)
      } catch {
        if (now <= cached.offlineGraceUntil) return cached
      }
    }
    const envKey = process.env.WANSHAN_LICENSE_KEY?.trim()
    if (envKey) return this.activate(envKey)
    return null
  }

  publicView(state: LicenseState | null): Omit<LicenseState, 'refreshToken'> | null {
    if (!state) return null
    const { refreshToken: _refreshToken, ...view } = state
    return view
  }
}
