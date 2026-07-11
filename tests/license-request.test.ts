import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildLicenseRequestBody, LICENSE_REFRESH_INTERVAL_SECONDS, LicenseHttpError } from '../electron/license-service'

describe('license request body', () => {
  it('includes the Wanshan self-media product code in activation requests', () => {
    expect(buildLicenseRequestBody({ card_key: 'TEST', device_hash: 'device' }, 'wanshan_zimeiti')).toEqual({
      card_key: 'TEST',
      device_hash: 'device',
      product_code: 'wanshan_zimeiti',
    })
  })

  it('refreshes commercial authorization roughly once per minute', () => {
    expect(LICENSE_REFRESH_INTERVAL_SECONDS).toBe(60)
    expect(readFileSync('electron/license-service.ts', 'utf8')).not.toContain('12 * 3600')
  })

  it('treats server-side authorization rejection as authoritative', () => {
    expect(new LicenseHttpError(403, '当前设备授权已冻结').authoritative).toBe(true)
    expect(new LicenseHttpError(410, '授权已过期').authoritative).toBe(true)
    expect(new LicenseHttpError(500, '服务器临时错误').authoritative).toBe(false)
  })

  it('clears cached licenses when refresh is rejected by the server', () => {
    const source = readFileSync('electron/license-service.ts', 'utf8')
    expect(source).toContain('if (this.isAuthoritativeRejection(error)) this.clearCache()')
    expect(source).toContain('startBackgroundRefresh')
    expect(readFileSync('electron/main.ts', 'utf8')).toContain('license.startBackgroundRefresh')
  })
})
