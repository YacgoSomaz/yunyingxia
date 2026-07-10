import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CredentialService, type SecretCodec } from '../electron/credential-service'

const codec: SecretCodec = {
  encrypt: (value) => Buffer.from(value, 'utf8').toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString('utf8')
}

describe('CredentialService', () => {
  it('stores an encrypted API key and returns only a key-presence flag', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wanshan-'))
    const file = join(dir, 'settings.json')
    const service = new CredentialService(file, codec)

    service.save({ baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini', apiKey: 'secret-key' })

    expect(readFileSync(file, 'utf8')).not.toContain('secret-key')
    expect(service.load()).toEqual({ baseUrl: 'https://api.example.com/v1', model: 'gpt-4o-mini', hasApiKey: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a remote HTTP endpoint', () => {
    const service = new CredentialService(':memory:', codec)
    expect(() => service.save({ baseUrl: 'http://example.com/v1', model: 'demo', apiKey: 'x' }))
      .toThrow('Base URL 必须使用 HTTPS 或 localhost')
  })
})
