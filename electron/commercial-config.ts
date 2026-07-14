import fs from 'node:fs'
import path from 'node:path'

export interface CommercialConfig {
  commercial: boolean
  licenseServerUrl: string
  licensePublicKey: string
  accountServerUrl: string
  accountPublicKey: string
  updatePublicKey: string
  integrityPublicKey: string
  offlineGraceHours: number
  productCode: string
  appName: string
  version: string
}

const DEFAULT_CONFIG: CommercialConfig = {
  commercial: true,
  licenseServerUrl: 'https://license.runmo.art',
  licensePublicKey: '',
  accountServerUrl: 'https://anyq.site',
  accountPublicKey: 'CqLAEE2KnduTFtw1gVQIExS1qLRa-XI3TaWpbchMbKc',
  updatePublicKey: '',
  integrityPublicKey: '',
  offlineGraceHours: 72,
  productCode: 'operation_shrimp',
  appName: '运营虾',
  version: '0.0.0-dev',
}

function assertHttps(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('商业授权服务器必须使用 HTTPS')
  }
  return parsed.toString().replace(/\/$/, '')
}

function normalizeHttpsBaseUrl(value: string): string {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error('账号服务必须使用 HTTPS')
  return parsed.toString().replace(/\/$/, '')
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
    accountServerUrl: normalizeHttpsBaseUrl(String(raw.accountServerUrl || DEFAULT_CONFIG.accountServerUrl)),
    accountPublicKey: String(raw.accountPublicKey || DEFAULT_CONFIG.accountPublicKey).trim(),
    updatePublicKey: String(raw.updatePublicKey || DEFAULT_CONFIG.updatePublicKey).trim(),
    integrityPublicKey: String(raw.integrityPublicKey || ''),
    offlineGraceHours: Math.max(0, Math.min(24 * 30, Number(raw.offlineGraceHours) || DEFAULT_CONFIG.offlineGraceHours)),
    productCode: String(raw.productCode || DEFAULT_CONFIG.productCode).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64),
    appName: String(raw.appName || DEFAULT_CONFIG.appName),
    version: String(raw.version || DEFAULT_CONFIG.version),
  }

  return config
}
