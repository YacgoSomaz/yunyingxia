import { describe, expect, it } from 'vitest'
import { compareVersions, isAllowedUpdateUrl, resolveUpdateFileUrl } from '../electron/update-service'

describe('update service safety helpers', () => {
  it('compares semantic versions without treating older builds as updates', () => {
    expect(compareVersions('0.1.4', '0.1.3')).toBeGreaterThan(0)
    expect(compareVersions('0.1.3', '0.1.3')).toBe(0)
    expect(compareVersions('0.1.2', '0.1.3')).toBeLessThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0)
  })

  it('only allows https update sources outside local development', () => {
    expect(isAllowedUpdateUrl('https://example.com/latest.json')).toBe(true)
    expect(isAllowedUpdateUrl('file:///C:/tmp/latest.json')).toBe(true)
    expect(isAllowedUpdateUrl('http://127.0.0.1:8080/latest.json')).toBe(true)
    expect(isAllowedUpdateUrl('http://example.com/latest.json')).toBe(false)
  })

  it('resolves relative installer urls against the manifest url', () => {
    expect(resolveUpdateFileUrl('https://updates.example.com/wanshan/latest.json', 'WanshanMediaSetup_0.1.4.exe')).toBe(
      'https://updates.example.com/wanshan/WanshanMediaSetup_0.1.4.exe',
    )
  })
})
