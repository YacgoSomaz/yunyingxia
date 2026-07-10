import fs from 'node:fs'
import path from 'node:path'

export interface CommercialConfig {
  commercial: boolean
  licenseServerUrl: string
  licensePublicKey: string
  integrityPublicKey: string
  offlineGraceHours: number
  productCode: string
  appName: string
  version: string
  updateFeedUrl: string
}

const DEFAULT_CONFIG: CommercialConfig = {
  commercial: false,
  licenseServerUrl: 'https://license.runmo.art',
  licensePublicKey: '',
  integrityPublicKey: '',
  offlineGraceHours: 72,
  productCode: 'wanshan_media',
  appName: '万山自媒体',
  version: '0.0.0-dev',
  updateFeedUrl: 'https://license.runmo.art/wanshan-media/updates/latest.json',
}

function assertHttps(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('商业授权服务器必须使用 HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

function normalizeOptionalUpdateUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parsed = new URL(trimmed)
  if (parsed.protocol === 'https:' || parsed.protocol === 'file:') return parsed.toString()
  if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return parsed.toString()
  throw new Error('更新源必须使用 HTTPS')
}

export function loadCommercialConfig(appRoot: string): CommercialConfig {
  const configPath = path.join(appRoot, 'commercial-config.json')
  if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<CommercialConfig>
  const config: CommercialConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    commercial: raw.commercial === true,
    licenseServerUrl: assertHttps(String(raw.licenseServerUrl || DEFAULT_CONFIG.licenseServerUrl)),
    licensePublicKey: String(raw.licensePublicKey || ''),
    integrityPublicKey: String(raw.integrityPublicKey || ''),
    offlineGraceHours: Math.max(0, Math.min(24 * 30, Number(raw.offlineGraceHours) || DEFAULT_CONFIG.offlineGraceHours)),
    productCode: String(raw.productCode || DEFAULT_CONFIG.productCode).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64),
    appName: String(raw.appName || DEFAULT_CONFIG.appName),
    version: String(raw.version || DEFAULT_CONFIG.version),
    updateFeedUrl: normalizeOptionalUpdateUrl(String(raw.updateFeedUrl || DEFAULT_CONFIG.updateFeedUrl)),
  }

  if (config.commercial && !config.licensePublicKey.trim()) {
    throw new Error('商业包缺少授权公钥')
  }
  return config
}
