import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyLatestRelease } from '../electron/release-verifier'
import { compareVersions, isAllowedUpdateUrl, preflightMandatoryUpdate, releaseEndpoint, requiresMandatoryUpdate, shouldOfferRelease } from '../electron/update-service'

function publicKeyBase64Url(key: crypto.KeyObject): string {
  return key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url')
}

function signedResponse(overrides: Record<string, unknown> = {}): { response: Record<string, unknown>; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    typ: 'desktop-release',
    iss: 'https://anyq.site',
    aud: 'operation_shrimp',
    issued_at: now,
    signed_until: now + 3600,
    product_id: 'operation_shrimp',
    version: '0.1.13',
    min_supported_version: '0.1.12',
    mandatory: false,
    installer_url: 'https://download.anyq.site/operation-shrimp/0.1.13/YunyingxiaSetup_0.1.13.exe',
    sha256: 'a'.repeat(64),
    size_bytes: 184920435,
    notes: '已修复更新流程。',
    published_at: '2026-07-14T12:00:00.000Z',
    ...overrides,
  }
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  return {
    response: {
      ok: true,
      version: '99.99.99',
      download_url: 'https://attacker.example/unsigned.exe',
      update_release: {
        schema: 'anyq.desktop-update.v1',
        alg: 'Ed25519',
        key_id: 'update-v1',
        payload: bytes.toString('base64url'),
        signature: crypto.sign(null, bytes, privateKey).toString('base64url'),
      },
    },
    publicKey: publicKeyBase64Url(publicKey),
  }
}

describe('signed product update client', () => {
  it('only requests the fixed operation_shrimp latest-release endpoint', () => {
    expect(releaseEndpoint('https://anyq.site')).toBe(
      'https://anyq.site/api/v1/releases/latest?product_id=operation_shrimp',
    )
  })

  it('uses only a valid signed update_release envelope, never unsigned root fields', () => {
    const { response, publicKey } = signedResponse()
    const release = verifyLatestRelease(response, publicKey)
    expect(release.version).toBe('0.1.13')
    expect(release.downloadUrl).toContain('download.anyq.site')
    expect(release.sizeBytes).toBe(184920435)
    expect(release.version).not.toBe(String(response.version))
  })

  it('treats an explicit no-release response as no update, not an unsigned fallback', () => {
    expect(verifyLatestRelease({ ok: true, update_release: null }, 'unused-public-key')).toBeNull()
  })

  it.each([
    ['signature', (response: Record<string, unknown>) => ({ ...response, update_release: { ...(response.update_release as Record<string, unknown>), signature: 'A'.repeat(86) } })],
    ['other product', (response: Record<string, unknown>) => {
      const envelope = response.update_release as Record<string, unknown>
      const payload = JSON.parse(Buffer.from(String(envelope.payload), 'base64url').toString('utf8'))
      payload.product_id = 'comic_shrimp'
      return { ...response, update_release: { ...envelope, payload: Buffer.from(JSON.stringify(payload)).toString('base64url') } }
    }],
  ])('rejects a bad %s signed release', (_label, mutate) => {
    const { response, publicKey } = signedResponse()
    expect(() => verifyLatestRelease(mutate(response), publicKey)).toThrow()
  })

  it.each([
    ['HTTP installer', { installer_url: 'http://download.anyq.site/update.exe' }],
    ['untrusted download host', { installer_url: 'https://download.attacker.example/update.exe' }],
    ['installer query string', { installer_url: 'https://download.anyq.site/update.exe?token=leak' }],
    ['installer fragment', { installer_url: 'https://download.anyq.site/update.exe#other' }],
    ['non-exe installer', { installer_url: 'https://download.anyq.site/update.zip' }],
    ['bad sha256', { sha256: 'not-a-hash' }],
    ['invalid version', { version: 'newest' }],
  ])('rejects invalid signed %s data', (_label, changes) => {
    const { response, publicKey } = signedResponse(changes)
    expect(() => verifyLatestRelease(response, publicKey)).toThrow()
  })

  it('compares versions for mandatory minimum-version enforcement', () => {
    expect(compareVersions('0.1.13', '0.1.12')).toBeGreaterThan(0)
    expect(compareVersions('0.1.12', '0.1.12')).toBe(0)
    expect(compareVersions('0.1.11', '0.1.12')).toBeLessThan(0)
  })

  it('shows a mandatory update for a signed mandatory flag or an unsupported local version', () => {
    expect(requiresMandatoryUpdate({ mandatory: true, minSupportedVersion: '0.1.12' }, '0.1.12')).toBe(true)
    expect(requiresMandatoryUpdate({ mandatory: false, minSupportedVersion: '0.1.13' }, '0.1.12')).toBe(true)
    expect(requiresMandatoryUpdate({ mandatory: false, minSupportedVersion: '0.1.12' }, '0.1.12')).toBe(false)
    expect(shouldOfferRelease({ version: '0.1.12', mandatory: true, minSupportedVersion: '0.1.12' }, '0.1.12')).toBe(true)
  })

  it('only permits signed HTTPS installer addresses', () => {
    expect(isAllowedUpdateUrl('https://download.anyq.site/update.exe')).toBe(true)
    expect(isAllowedUpdateUrl('file:///C:/tmp/update.exe')).toBe(false)
    expect(isAllowedUpdateUrl('http://127.0.0.1:8080/update.exe')).toBe(false)
  })

  it('preflights only signed mandatory releases before startup', async () => {
    const mandatory = signedResponse({ mandatory: true })
    const optional = signedResponse({ mandatory: false, min_supported_version: '0.1.12' })
    await expect(preflightMandatoryUpdate(
      { accountServerUrl: 'https://anyq.site', updatePublicKey: mandatory.publicKey, version: '0.1.12' },
      async () => new Response(JSON.stringify(mandatory.response), { status: 200 }),
    )).resolves.toMatchObject({ version: '0.1.13', mandatory: true })
    await expect(preflightMandatoryUpdate(
      { accountServerUrl: 'https://anyq.site', updatePublicKey: optional.publicKey, version: '0.1.12' },
      async () => new Response(JSON.stringify(optional.response), { status: 200 }),
    )).resolves.toBeNull()
  })

  it('prompts normally unless the signed mandatory flag or signed minimum version requires update', () => {
    const source = readFileSync(join(process.cwd(), 'electron', 'update-service.ts'), 'utf8')
    expect(source).toContain('const mandatory = requiresMandatoryUpdate(release, config.version)')
    expect(source).toContain('if (!shouldOfferRelease(release, config.version))')
    expect(source).toContain("['下载更新', '稍后']")
    expect(source).toContain("['下载必须更新']")
    expect(source).toContain("['立即安装', '稍后安装']")
    expect(source).toContain("['立即安装必须更新']")
    expect(source).toContain("spawn(downloadedUpdate.filePath, ['/UPDATE', '/CLOSEAPPLICATIONS']")
    expect(source).toContain('release.sizeBytes')
  })

  it('contains no legacy unsigned manifest or update-feed fallback', () => {
    const source = readFileSync(join(process.cwd(), 'electron', 'update-service.ts'), 'utf8')
    expect(source).toContain('verifyLatestRelease')
    expect(source).toContain('releaseEndpoint')
    expect(source).not.toContain('latest.json')
    expect(source).not.toContain('latest.yml')
    expect(source).not.toContain('updateFeedUrl')
    expect(source).not.toContain('sha512')
  })
})
