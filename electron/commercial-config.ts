import fs from 'node:fs'
import path from 'node:path'

export interface CommercialConfig {
  commercial: boolean
  licenseServerUrl: string
  licensePublicKey: string
  offlineGraceHours: number
  productCode: string
  appName: string
  version: string
}

const DEFAULT_CONFIG: CommercialConfig = {
  commercial: false,
  licenseServerUrl: 'https://license.runmo.art',
  licensePublicKey: '',
  offlineGraceHours: 72,
  productCode: 'wanshan_media',
  appName: '万山自媒体',
  version: '0.0.0-dev',
}

function assertHttps(url: string): string {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') {
    throw new Error('商业授权服务器必须使用 HTTPS')
  }
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
    offlineGraceHours: Math.max(0, Math.min(24 * 30, Number(raw.offlineGraceHours) || DEFAULT_CONFIG.offlineGraceHours)),
    productCode: String(raw.productCode || DEFAULT_CONFIG.productCode).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64),
    appName: String(raw.appName || DEFAULT_CONFIG.appName),
    version: String(raw.version || DEFAULT_CONFIG.version),
  }

  if (config.commercial && !config.licensePublicKey.trim()) {
    throw new Error('商业包缺少授权公钥')
  }
  return config
}
