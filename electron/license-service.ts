import { app, safeStorage } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CommercialConfig } from './commercial-config'
import { verifyLicenseDocument } from './license-crypto'

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

export function buildLicenseRequestBody(body: Record<string, unknown>, productCode: string): Record<string, unknown> {
  return { ...body, product_code: productCode }
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

  private async post(endpoint: string, body: Record<string, unknown>, signingSecret: string): Promise<Record<string, unknown>> {
    const url = new URL(`${this.config.licenseServerUrl}/v1/${endpoint}`)
    const canonical = JSON.stringify(Object.keys(body).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = body[key]
      return result
    }, {}))
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = crypto.randomUUID()
    const deviceHash = String(body.device_hash || this.deviceHash())
    const appVersion = String(body.app_version || this.config.version)
    const signingBase = ['POST', url.pathname, timestamp, nonce, deviceHash, appVersion, crypto.createHash('sha256').update(canonical).digest('hex')].join('\n')
    const response = await fetch(`${this.config.licenseServerUrl}/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'X-LiveWatch-Timestamp': timestamp,
        'X-LiveWatch-Nonce': nonce,
        'X-LiveWatch-Device': deviceHash,
        'X-LiveWatch-App-Version': appVersion,
        'X-LiveWatch-Signature': crypto.createHmac('sha256', signingSecret).update(signingBase).digest('hex'),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(String(data.detail || data.message || `授权服务 HTTP ${response.status}`))
    return data
  }

  private normalize(body: Record<string, unknown>, previous?: LicenseState): LicenseState {
    const licenseDocument = body.license as { alg?: string; payload?: string; signature?: string } | undefined
    if (!licenseDocument?.payload || !licenseDocument.signature) throw new Error('授权响应缺少签名授权文件')
    const source = verifyLicenseDocument(licenseDocument as { alg?: string; payload: string; signature: string }, this.config.licensePublicKey, this.deviceHash(), this.config.productCode)
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = epoch(source.expires_at ?? body.expires_at)
    return {
      status: String(source.status ?? body.status ?? 'active') as LicenseState['status'],
      activationId: String(source.activation_id ?? body.activation_id ?? previous?.activationId ?? ''),
      refreshToken: String(source.refresh_token ?? body.refresh_token ?? previous?.refreshToken ?? ''),
      deviceHash: this.deviceHash(),
      features: Array.isArray(source.features ?? body.features) ? (source.features ?? body.features) as string[] : [],
      expiresAt,
      offlineGraceUntil: epoch(source.grace_until ?? source.offline_grace_until ?? body.offline_grace_until) || now + this.config.offlineGraceHours * 3600,
      lastCheckedAt: now,
    }
  }

  async activate(cardKey: string): Promise<LicenseState> {
    const key = String(cardKey || '').trim()
    if (key.length < 4 || key.length > 128) throw new Error('卡密格式无效')
    const body = await this.post(
      'activate',
      buildLicenseRequestBody({ card_key: key.toUpperCase(), device_hash: this.deviceHash(), app_version: this.config.version }, this.config.productCode),
      key.toUpperCase(),
    )
    const state = this.normalize(body)
    if (state.status !== 'active' || !state.activationId || !state.refreshToken) throw new Error('授权服务返回的授权状态无效')
    this.writeCache(state)
    return state
  }

  async refresh(state: LicenseState): Promise<LicenseState> {
    const body = await this.post(
      'refresh',
      buildLicenseRequestBody({
        activation_id: state.activationId,
        refresh_token: state.refreshToken,
        device_hash: this.deviceHash(),
        app_version: this.config.version,
      }, this.config.productCode),
      state.refreshToken,
    )
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
