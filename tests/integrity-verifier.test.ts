import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  INTEGRITY_MUTABLE_PATH_PREFIXES,
  INTEGRITY_PROTECTED_EXACT_PATHS,
  isIntegrityMutablePath,
  isIntegrityProtectedPath,
} from '../electron/integrity-policy'
import { verifyIntegrity } from '../electron/integrity-verifier'

const b64url = (value: Buffer) => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

function makeManifest(root: string): string {
  const files: Record<string, { sha256: string; size: number }> = {}
  for (const relative of INTEGRITY_PROTECTED_EXACT_PATHS) {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, relative)
    const content = fs.readFileSync(file)
    files[relative] = { sha256: crypto.createHash('sha256').update(content).digest('hex'), size: content.length }
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const rawPublicKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
  const canonical = JSON.stringify({ version: 1, algorithm: 'sha256', files })
  fs.writeFileSync(path.join(root, 'integrity_manifest.json'), JSON.stringify({
    version: 1,
    algorithm: 'sha256',
    files,
    signature: { algorithm: 'Ed25519', payload: b64url(Buffer.from(canonical)), signature: b64url(crypto.sign(null, Buffer.from(canonical), privateKey)) },
  }))
  return b64url(rawPublicKey)
}

describe('integrity verifier', () => {
  it('accepts a clean package and rejects tampering', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanshan-integrity-'))
    const publicKey = makeManifest(root)
    expect(verifyIntegrity(root, undefined, publicKey).ok).toBe(true)
    fs.appendFileSync(path.join(root, 'package.json'), 'tampered')
    expect(verifyIntegrity(root, undefined, publicKey).ok).toBe(false)
  })

  it('limits integrity protection to the explicit startup and entitlement files', () => {
    expect(isIntegrityProtectedPath('dist-electron/electron/account-service.js')).toBe(true)
    expect(isIntegrityProtectedPath('vendor/qianshan-runtime/dist/paid-action-auth.js')).toBe(true)
    expect(isIntegrityProtectedPath('vendor/qianshan-runtime/renderer/dist/index.html')).toBe(false)
    expect(isIntegrityProtectedPath('vendor/qianshan-runtime/dist/services/llm-config.js')).toBe(false)
  })

  it('keeps user-mutable paths out of integrity protection', () => {
    for (const prefix of INTEGRITY_MUTABLE_PATH_PREFIXES) {
      expect(isIntegrityMutablePath(`${prefix}sample.txt`)).toBe(true)
      expect(isIntegrityProtectedPath(`${prefix}sample.txt`)).toBe(false)
    }
    expect(isIntegrityProtectedPath('vendor/qianshan-runtime/uploads/material.png')).toBe(false)
    expect(isIntegrityProtectedPath('vendor/qianshan-runtime/data/app.sqlite')).toBe(false)
    expect(isIntegrityProtectedPath('cache/official-ai/image.png')).toBe(false)
  })

  it('allows user content and unlisted runtime files without blocking startup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanshan-integrity-'))
    const publicKey = makeManifest(root)
    const userFile = path.join(root, 'data', 'exports', 'article.txt')
    fs.mkdirSync(path.dirname(userFile), { recursive: true })
    fs.writeFileSync(userFile, 'user-created export')
    const runtimeFile = path.join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'llm-config.js')
    fs.mkdirSync(path.dirname(runtimeFile), { recursive: true })
    fs.writeFileSync(runtimeFile, 'user configuration bridge')
    expect(verifyIntegrity(root, undefined, publicKey).ok).toBe(true)
  })
})
