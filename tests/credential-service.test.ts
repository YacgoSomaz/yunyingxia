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

    service.save({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', apiKey: 'secret-key' })

    expect(readFileSync(file, 'utf8')).not.toContain('secret-key')
    expect(service.load()).toEqual({ baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-v4-flash', hasApiKey: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it('allows a remote HTTP relay endpoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wanshan-'))
    const file = join(dir, 'settings.json')
    const service = new CredentialService(file, codec)
    expect(service.save({ baseUrl: 'http://example.com/v1', model: 'demo', apiKey: 'x' }))
      .toEqual({ baseUrl: 'http://example.com/v1', model: 'demo', hasApiKey: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it('allows a HTTPS relay endpoint', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wanshan-'))
    const file = join(dir, 'settings.json')
    const service = new CredentialService(file, codec)
    expect(service.save({ baseUrl: 'https://api.example.com/v1', model: 'relay-model', apiKey: 'x' }))
      .toEqual({ baseUrl: 'https://api.example.com/v1', model: 'relay-model', hasApiKey: true })
    rmSync(dir, { recursive: true, force: true })
  })

  it('only rejects an empty model id', () => {
    const service = new CredentialService(':memory:', codec)
    expect(() => service.save({ baseUrl: 'https://api.deepseek.com/v1', model: '  ', apiKey: 'x' }))
      .toThrow('请填写模型/接入点 ID')
  })
})
