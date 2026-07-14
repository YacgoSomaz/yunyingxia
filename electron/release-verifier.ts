import { verifyEd25519Signature } from './license-crypto'

export const UPDATE_SCHEMA = 'anyq.desktop-update.v1'
export const UPDATE_TYPE = 'desktop-release'
export const UPDATE_KEY_ID = 'update-v1'
export const UPDATE_ISSUER = 'https://anyq.site'
export const OPERATION_PRODUCT_ID = 'operation_shrimp'
export const UPDATE_DOWNLOAD_ORIGIN = 'https://download.anyq.site'

export interface VerifiedRelease {
  version: string
  mandatory: boolean
  minSupportedVersion: string
  downloadUrl: string
  sha256: string
  sizeBytes: number
  notes: string
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from(normalized, 'base64')
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function version(value: unknown, message: string): string {
  const text = String(value || '').trim()
  if (!/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(text)) throw new Error(message)
  return text
}

function compareVersions(left: string, right: string): number {
  const numeric = (value: string) => value.split(/[+-]/, 1)[0].split('.').map((part) => Number(part))
  const a = numeric(left)
  const b = numeric(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] || 0) - (b[index] || 0)
    if (delta) return delta
  }
  return left.localeCompare(right)
}

export function isAllowedUpdateUrl(value: string): boolean {
  const text = String(value || '').trim()
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return false
  }
  return parsed.origin === UPDATE_DOWNLOAD_ORIGIN
    && !parsed.username
    && !parsed.password
    && !parsed.hash
    && !parsed.search
    && parsed.pathname.toLowerCase().endsWith('.exe')
}

function installerUrl(value: unknown): string {
  const text = String(value || '').trim()
  if (!isAllowedUpdateUrl(text)) throw new Error('更新下载地址必须是 download.anyq.site 的 HTTPS 安装包')
  return new URL(text).toString()
}

export function verifyLatestRelease(response: unknown, publicKey: string, now = Math.floor(Date.now() / 1000)): VerifiedRelease | null {
  const root = object(response, '更新服务响应无效')
  if (root.update_release === null) return null
  if (!publicKey.trim()) throw new Error('更新签名公钥未配置')
  const envelope = object(root.update_release, '更新服务未返回签名发布包')
  if (envelope.schema !== UPDATE_SCHEMA || envelope.alg !== 'Ed25519' || envelope.key_id !== UPDATE_KEY_ID) {
    throw new Error('更新发布包协议不匹配')
  }

  const payloadBytes = decodeBase64Url(String(envelope.payload || ''))
  const signature = decodeBase64Url(String(envelope.signature || ''))
  if (signature.length !== 64 || !verifyEd25519Signature(payloadBytes, signature, publicKey)) {
    throw new Error('更新发布包签名校验失败')
  }

  let payload: Record<string, unknown>
  try {
    payload = object(JSON.parse(payloadBytes.toString('utf8')), '更新发布包载荷无效')
  } catch {
    throw new Error('更新发布包载荷无效')
  }
  if (payload.typ !== UPDATE_TYPE || payload.iss !== UPDATE_ISSUER || payload.aud !== OPERATION_PRODUCT_ID || payload.product_id !== OPERATION_PRODUCT_ID) {
    throw new Error('更新发布包产品或签发方不匹配')
  }

  const issuedAt = Number(payload.issued_at)
  const signedUntil = Number(payload.signed_until)
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(signedUntil) || signedUntil < now || signedUntil - issuedAt < 60 || signedUntil - issuedAt > 86_400) {
    throw new Error('更新发布包签名已过期或无效')
  }

  const releaseVersion = version(payload.version, '更新发布包版本无效')
  const minSupportedVersion = version(payload.min_supported_version, '更新发布包最低版本无效')
  if (compareVersions(minSupportedVersion, releaseVersion) > 0) throw new Error('更新发布包最低版本无效')

  const sha256 = String(payload.sha256 || '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('更新包 SHA-256 无效')
  if (typeof payload.mandatory !== 'boolean') throw new Error('更新发布包 mandatory 字段无效')
  const sizeBytes = Number(payload.size_bytes)
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024 * 1024) throw new Error('更新包大小无效')
  if (!Number.isFinite(Date.parse(String(payload.published_at || '')))) throw new Error('更新发布时间无效')

  return {
    version: releaseVersion,
    mandatory: payload.mandatory,
    minSupportedVersion,
    downloadUrl: installerUrl(payload.installer_url),
    sha256,
    sizeBytes,
    notes: typeof payload.notes === 'string' ? payload.notes.slice(0, 4000) : '',
  }
}
