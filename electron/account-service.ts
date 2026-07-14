import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { CommercialConfig } from './commercial-config'
import { verifyEd25519Signature } from './license-crypto'

export const ACCOUNT_REFRESH_INTERVAL_SECONDS = 10 * 60
export const OPERATION_PRODUCT_ID = 'operation_shrimp'
export const OPERATION_ENTITLEMENT = 'operation_course'
export const ACCOUNT_LICENSE_SCHEMA = 'anyq.account-license.v1'
export const ACCOUNT_LICENSE_ISSUER = 'https://anyq.site'
export const ACCOUNT_LICENSE_KEY_ID = 'account-v1'
const ACCOUNT_LICENSE_CLOCK_SKEW_SECONDS = 120

export interface AccountProduct {
  product_id: string
  name: string
  price_cents: number
  duration_days: number
  status: 'active' | 'expired' | 'inactive' | 'pending' | string
  expires_at: string | null
  entitlements: string[]
  metadata?: Record<string, unknown>
}

export interface AccountUser {
  id: number
  phone: string
  created_at?: string
  last_login_at?: string
  energy_balance: number
  membership_expires_at?: string | null
  membership_plan?: string | null
  is_member?: boolean
  member_level?: 'free' | 'monthly' | 'quarterly' | 'yearly' | 'paid' | string
  features?: string[]
  server_time?: string
  need_recharge?: boolean
  remaining_days?: number
  products?: unknown
}

export interface AccountState {
  cookie: string
  user: AccountUser
  products: AccountProduct[]
  productsAuthoritative?: boolean
  expiresAt?: string
  lastCheckedAt: number
}

export interface AccountLicense {
  schema?: string
  alg?: string
  key_id?: string
  payload: string
  signature: string
}

export interface TrustedAccountData {
  user: AccountUser
  products: AccountProduct[]
  signedUntil?: number
}

export interface AccountPlan {
  id: string
  name: string
  amountCents: number
  durationDays: number
  energy?: number
  entitlements?: string[]
}

export class AccountHttpError extends Error {
  readonly status: number
  readonly authoritative: boolean

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AccountHttpError'
    this.status = status
    this.authoritative = [400, 401, 403, 404, 409, 410].includes(status)
  }
}

export const DEFAULT_ACCOUNT_PLANS: AccountPlan[] = [
  { id: OPERATION_PRODUCT_ID, name: '运营虾', amountCents: 79900, durationDays: 365, energy: 0 },
]

export function normalizePhone(phone: unknown): string {
  return String(phone || '').trim().replace(/^\+86/, '').replace(/^86(?=1\d{10}$)/, '')
}

export function isValidPhone(phone: unknown): boolean {
  return /^1[3-9]\d{9}$/.test(normalizePhone(phone))
}

function hasOperationProduct(products: AccountProduct[] | null | undefined, now = Date.now()): boolean {
  const product = (products || []).find((item) => item.product_id === OPERATION_PRODUCT_ID)
  if (!product || product.status !== 'active') return false
  const expiresAt = Date.parse(String(product.expires_at || ''))
  return Number.isFinite(expiresAt)
    && expiresAt > now
    && product.entitlements.includes(OPERATION_ENTITLEMENT)
}

function hasLegacyAccess(user: AccountUser, now = Date.now()): boolean {
  if (user.is_member === false) return false
  const expiresAt = Date.parse(String(user.membership_expires_at || ''))
  const serverNow = Date.parse(String(user.server_time || ''))
  const referenceNow = Number.isFinite(serverNow) ? serverNow : now
  const derived = Number.isFinite(expiresAt) && expiresAt > referenceNow && Number(user.energy_balance || 0) > 0
  return derived
}

function isAccountState(input: AccountUser | AccountState): input is AccountState {
  return 'user' in input && Boolean(input.user)
}

export function hasActiveAccess(input: AccountUser | AccountState | null | undefined, now = Date.now()): boolean {
  if (!input) return false
  if (isAccountState(input)) {
    return input.productsAuthoritative === true && hasOperationProduct(input.products, now)
  }
  // Raw response users and root products are display-only. A signed
  // account_license payload is required before a client may unlock features.
  return false
}

function deriveMemberLevel(plan: unknown, active: boolean): AccountUser['member_level'] {
  if (!active) return 'free'
  const text = String(plan || '').toLowerCase()
  if (/monthly|月/.test(text)) return 'monthly'
  if (/quarter|季/.test(text)) return 'quarterly'
  if (/year|年/.test(text)) return 'yearly'
  return 'paid'
}

export function normalizeAccountUser(input: unknown, now = Date.now()): AccountUser {
  const row = (input && typeof input === 'object' ? input : {}) as Partial<AccountUser>
  const energy = Number(row.energy_balance || 0)
  const serverTime = String(row.server_time || new Date(now).toISOString())
  const serverNow = Date.parse(serverTime)
  const referenceNow = Number.isFinite(serverNow) ? serverNow : now
  const expiresAt = Date.parse(String(row.membership_expires_at || ''))
  const derivedMember = Number.isFinite(expiresAt) && expiresAt > referenceNow && energy > 0
  const isMember = typeof row.is_member === 'boolean' ? row.is_member && derivedMember : derivedMember
  const remainingDays = Number.isFinite(Number(row.remaining_days))
    ? Math.max(0, Math.floor(Number(row.remaining_days)))
    : Number.isFinite(expiresAt)
      ? Math.max(0, Math.ceil((expiresAt - referenceNow) / 86400_000))
      : 0
  const features = Array.isArray(row.features)
    ? row.features.map((item) => String(item)).filter(Boolean)
    : isMember
      ? ['copywriting', 'topic_radar', 'video_workshop', 'publish', 'digital_human']
      : []
  return {
    ...row,
    id: Number(row.id || 0),
    phone: String(row.phone || ''),
    energy_balance: energy,
    membership_expires_at: row.membership_expires_at || null,
    membership_plan: row.membership_plan || null,
    is_member: isMember,
    member_level: String(row.member_level || deriveMemberLevel(row.membership_plan, isMember)),
    features,
    server_time: serverTime,
    need_recharge: typeof row.need_recharge === 'boolean' ? row.need_recharge : !isMember,
    remaining_days: remainingDays,
  }
}

export function normalizeAccountProducts(input: unknown, fallbackUser?: AccountUser, now = Date.now()): AccountProduct[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        const row = (item && typeof item === 'object' ? item : {}) as Partial<AccountProduct>
        return {
          product_id: String(row.product_id || ''),
          name: String(row.name || ''),
          price_cents: Number(row.price_cents || 0),
          duration_days: Number(row.duration_days || 0),
          status: String(row.status || 'inactive') as AccountProduct['status'],
          expires_at: row.expires_at ? String(row.expires_at) : null,
          entitlements: Array.isArray(row.entitlements) ? row.entitlements.map((value) => String(value)).filter(Boolean) : [],
          metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : undefined,
        }
      })
      .filter((item) => item.product_id)
  }

  if (!fallbackUser || !hasLegacyAccess(fallbackUser, now)) return []
  return [{
    product_id: OPERATION_PRODUCT_ID,
    name: '运营虾',
    price_cents: 79900,
    duration_days: Math.max(0, Number(fallbackUser.remaining_days || 0)),
    status: 'active',
    expires_at: fallbackUser.membership_expires_at || null,
    entitlements: [OPERATION_ENTITLEMENT],
  }]
}

export function accountProductsFromResponse(payload: unknown, fallbackUser?: AccountUser, now = Date.now()): { products: AccountProduct[]; authoritative: boolean } {
  void payload
  void fallbackUser
  void now
  // Kept as a compatibility helper for UI-only callers. It must never turn an
  // unsigned root response into authorization state.
  return { products: [], authoritative: false }
}

function publicState(state: AccountState | null): Omit<AccountState, 'cookie'> | null {
  if (!state) return null
  const { cookie: _cookie, ...view } = state
  return view
}

function parseCookie(setCookie: string | null): string {
  const first = String(setCookie || '').split(/,(?=[^;,]+=)/)[0]?.trim()
  const pair = first?.split(';')[0]?.trim()
  if (!pair || !/^[A-Za-z0-9_.-]+=/.test(pair)) throw new Error('登录响应缺少会话 Cookie')
  return pair
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from(normalized, 'base64')
}

function parseSignedJson(payloadBytes: Buffer): Record<string, unknown> {
  const text = payloadBytes.toString('utf8')
  const stack: Array<{ type: 'object' | 'array'; keys?: Set<string> }> = []
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      let rawKey = ''
      index += 1
      for (; index < text.length; index += 1) {
        const current = text[index]
        if (current === '\\') {
          rawKey += current
          index += 1
          if (index < text.length) rawKey += text[index]
          continue
        }
        if (current === '"') break
        rawKey += current
      }
      let next = index + 1
      while (next < text.length && /\s/.test(text[next])) next += 1
      const container = stack[stack.length - 1]
      if (container?.type === 'object' && text[next] === ':') {
        let key: unknown
        try {
          key = JSON.parse(`"${rawKey}"`)
        } catch {
          throw new Error('账号授权包载荷格式无效')
        }
        if (typeof key !== 'string' || container.keys?.has(key)) throw new Error('账号授权包载荷包含重复字段')
        container.keys?.add(key)
      }
      continue
    }
    if (char === '{') stack.push({ type: 'object', keys: new Set() })
    else if (char === '[') stack.push({ type: 'array' })
    else if (char === '}' || char === ']') stack.pop()
  }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not object')
    return value as Record<string, unknown>
  } catch {
    throw new Error('账号授权包载荷格式无效')
  }
}

function objectField(input: unknown, key: string): unknown {
  return input && typeof input === 'object' ? (input as Record<string, unknown>)[key] : undefined
}

export function verifyAccountEnvelope(
  envelope: AccountLicense,
  publicKey: string,
  now = Date.now(),
): TrustedAccountData {
  if (!envelope || typeof envelope !== 'object') throw new Error('账号服务未返回签名授权包')
  if (envelope.schema !== ACCOUNT_LICENSE_SCHEMA) throw new Error('账号授权包协议不匹配')
  if (envelope.alg !== 'Ed25519') throw new Error('账号授权包签名算法不受支持')
  if (envelope.key_id !== ACCOUNT_LICENSE_KEY_ID) throw new Error('账号授权包签名密钥不受支持')
  const payloadBytes = decodeBase64Url(String(envelope.payload || ''))
  const signature = decodeBase64Url(String(envelope.signature || ''))
  if (!verifyEd25519Signature(payloadBytes, signature, publicKey)) throw new Error('账号授权包签名校验失败')

  const payload = parseSignedJson(payloadBytes)
  if (payload.typ !== ACCOUNT_LICENSE_SCHEMA) throw new Error('账号授权包类型不匹配')
  if (payload.iss !== ACCOUNT_LICENSE_ISSUER) throw new Error('账号授权包签发方不匹配')
  if (payload.aud !== OPERATION_PRODUCT_ID) throw new Error('账号授权包产品不匹配')

  const nowSeconds = Math.floor(now / 1000)
  const issuedAt = Number(payload.issued_at)
  const signedUntil = Number(payload.signed_until)
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(signedUntil)) throw new Error('账号授权包时间字段无效')
  if (issuedAt > nowSeconds + ACCOUNT_LICENSE_CLOCK_SKEW_SECONDS) throw new Error('账号授权包时间异常')
  if (signedUntil <= nowSeconds) throw new Error('账号授权包已过期，请重新登录')
  if (signedUntil <= issuedAt || signedUntil - issuedAt > ACCOUNT_REFRESH_INTERVAL_SECONDS) throw new Error('账号授权包时间范围无效')

  const user = normalizeAccountUser(payload.user, now)
  const productSource = objectField(payload, 'products') ?? objectField(payload.user, 'products')
  return {
    user,
    products: normalizeAccountProducts(productSource, undefined, now),
    signedUntil,
  }
}

function isAccountTrustError(error: unknown): boolean {
  return error instanceof Error
    && /^(账号授权包|账号服务未返回签名授权包)/.test(error.message)
}

export class AccountService {
  private readonly config: CommercialConfig
  private readonly cachePath: string

  constructor(config: CommercialConfig) {
    this.config = config
    this.cachePath = path.join(app.getPath('userData'), 'data', 'account-session.bin')
  }

  private dataDir(): string {
    const dir = path.dirname(this.cachePath)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  private url(endpoint: string): string {
    return `${this.config.accountServerUrl.replace(/\/$/, '')}${endpoint}`
  }

  private async request(endpoint: string, options: { method?: string; body?: Record<string, unknown>; cookie?: string } = {}): Promise<{ data: Record<string, unknown>; setCookie: string | null }> {
    const response = await fetch(this.url(endpoint), {
      method: options.method || 'GET',
      headers: {
        accept: 'application/json',
        'x-product-code': OPERATION_PRODUCT_ID,
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new AccountHttpError(response.status, String(data.error || data.message || `账号服务 HTTP ${response.status}`))
    return { data, setCookie: response.headers.get('set-cookie') }
  }

  private trustedAccountData(data: Record<string, unknown>): TrustedAccountData {
    const publicKey = String(this.config.accountPublicKey || '').trim()
    const envelope = data.account_license
    if (!publicKey) throw new Error('账号验签公钥未配置')
    return verifyAccountEnvelope(envelope as AccountLicense, publicKey)
  }

  private readCache(): AccountState | null {
    if (!fs.existsSync(this.cachePath)) return null
    try {
      const wrapper = JSON.parse(fs.readFileSync(this.cachePath, 'utf8')) as { encrypted?: string }
      if (!wrapper.encrypted || !safeStorage.isEncryptionAvailable()) return null
      const state = JSON.parse(safeStorage.decryptString(Buffer.from(wrapper.encrypted, 'base64'))) as AccountState
      const user = normalizeAccountUser(state.user)
      const productsAuthoritative = state.productsAuthoritative === true
      return {
        ...state,
        user,
        products: normalizeAccountProducts(state.products, productsAuthoritative ? undefined : undefined),
        productsAuthoritative,
      }
    } catch {
      return null
    }
  }

  private writeCache(state: AccountState): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统不支持安全账号缓存')
    this.dataDir()
    const encrypted = safeStorage.encryptString(JSON.stringify(state)).toString('base64')
    fs.writeFileSync(this.cachePath, JSON.stringify({ encrypted }), { encoding: 'utf8', mode: 0o600 })
  }

  clearCache(): void {
    try {
      if (fs.existsSync(this.cachePath)) fs.rmSync(this.cachePath, { force: true })
    } catch {
      // Cache cleanup should not hide the account error that triggered it.
    }
  }

  async sendCode(phoneInput: unknown): Promise<{ ok: true; message: string }> {
    const phone = normalizePhone(phoneInput)
    if (!isValidPhone(phone)) throw new Error('请输入正确的手机号')
    const { data } = await this.request('/api/auth/send-code', { method: 'POST', body: { phone } })
    if (data.ok !== true) throw new Error(String(data.error || '验证码发送失败'))
    return { ok: true, message: String(data.message || '验证码已发送') }
  }

  async login(phoneInput: unknown, codeInput: unknown): Promise<AccountState> {
    const phone = normalizePhone(phoneInput)
    const code = String(codeInput || '').trim()
    if (!isValidPhone(phone) || !/^\d{4,8}$/.test(code)) throw new Error('手机号或验证码格式不正确')
    const { data, setCookie } = await this.request('/api/auth/login', { method: 'POST', body: { phone, code } })
    if (data.ok !== true || !data.user) throw new Error(String(data.error || '登录失败'))
    const trusted = this.trustedAccountData(data)
    const state: AccountState = {
      cookie: parseCookie(setCookie),
      user: trusted.user,
      products: trusted.products,
      productsAuthoritative: true,
      expiresAt: String(data.expiresAt || (trusted.signedUntil ? new Date(trusted.signedUntil * 1000).toISOString() : '')),
      lastCheckedAt: Math.floor(Date.now() / 1000),
    }
    this.writeCache(state)
    return state
  }

  async refresh(state = this.readCache()): Promise<AccountState | null> {
    if (!state?.cookie) return null
    try {
      const { data } = await this.request('/api/auth/me', { cookie: state.cookie })
      if (data.ok !== true || !data.user) {
        this.clearCache()
        return null
      }
      const trusted = this.trustedAccountData(data)
      const refreshed: AccountState = {
        ...state,
        user: trusted.user,
        products: trusted.products,
        productsAuthoritative: true,
        lastCheckedAt: Math.floor(Date.now() / 1000),
      }
      this.writeCache(refreshed)
      return refreshed
    } catch (error) {
      if ((error instanceof AccountHttpError && error.authoritative) || isAccountTrustError(error)) this.clearCache()
      throw error
    }
  }

  async ensureSession(): Promise<AccountState | null> {
    const cached = this.readCache()
    if (!cached) return null
    return this.refresh(cached)
  }

  currentState(): AccountState | null {
    return this.readCache()
  }

  async ensureEntitled(): Promise<AccountState | null> {
    const state = await this.ensureSession()
    return hasActiveAccess(state) ? state : null
  }

  async logout(): Promise<void> {
    const cached = this.readCache()
    if (cached?.cookie) {
      await this.request('/api/auth/logout', { method: 'POST', cookie: cached.cookie }).catch(() => undefined)
    }
    this.clearCache()
  }

  async plans(): Promise<AccountPlan[]> {
    try {
      const { data } = await this.request('/api/pay/plans')
      if (Array.isArray(data.plans)) return data.plans as unknown as AccountPlan[]
    } catch {
      // Older recharge servers do not expose a plan endpoint yet; use the current server constants.
    }
    return DEFAULT_ACCOUNT_PLANS
  }

  async createWebHandoff(): Promise<string> {
    const state = this.readCache()
    if (!state?.cookie) throw new Error('请先登录账号')
    try {
      const { data } = await this.request('/api/auth/web-handoff', { method: 'POST', cookie: state.cookie })
      const value = String(data.continueUrl || '').trim()
      const server = new URL(this.config.accountServerUrl)
      const target = new URL(value)
      if (
        server.protocol !== 'https:'
        || target.protocol !== 'https:'
        || target.origin !== server.origin
        || target.pathname !== '/account/continue'
        || !target.hash.startsWith('#ticket=')
      ) throw new Error('账号服务返回的续费地址无效')
      return value
    } catch (error) {
      if (error instanceof AccountHttpError && error.authoritative) this.clearCache()
      throw error
    }
  }

  startBackgroundRefresh(
    onInvalid: (error: Error) => void,
    onState?: (state: AccountState) => void,
  ): NodeJS.Timeout {
    const run = async () => {
      const cached = this.readCache()
      if (!cached) {
        onInvalid(new Error('登录已失效，请重新登录。'))
        return
      }
      if (Math.floor(Date.now() / 1000) - cached.lastCheckedAt < ACCOUNT_REFRESH_INTERVAL_SECONDS) return
      try {
        const refreshed = await this.refresh(cached)
        if (!refreshed) {
          onInvalid(new Error('登录已失效，请重新登录。'))
          return
        }
        onState?.(refreshed)
      } catch (error) {
        onInvalid(error instanceof Error ? error : new Error('账号状态校验失败，请重新登录。'))
      }
    }
    const timer = setInterval(() => { void run() }, ACCOUNT_REFRESH_INTERVAL_SECONDS * 1000)
    timer.unref?.()
    void run()
    return timer
  }

  publicView(state: AccountState | null): Omit<AccountState, 'cookie'> | null {
    return publicState(state)
  }
}
