import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { verifyIntegrity } from '../electron/integrity-verifier'

function makeManifest(root: string) {
  const files: Record<string, { sha256: string; size: number }> = {}
  for (const relative of ['package.json', 'dist-electron/electron/main.js', 'vendor/qianshan-runtime/dist/server.js', 'vendor/qianshan-runtime/renderer/dist/index.html']) {
    const file = path.join(root, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, relative)
    const content = fs.readFileSync(file)
    files[relative] = { sha256: crypto.createHash('sha256').update(content).digest('hex'), size: content.length }
  }
  fs.writeFileSync(path.join(root, 'integrity_manifest.json'), JSON.stringify({ version: 1, algorithm: 'sha256', files }))
}

describe('integrity verifier', () => {
  it('accepts a clean package and rejects tampering', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanshan-integrity-'))
    makeManifest(root)
    expect(verifyIntegrity(root).ok).toBe(true)
    fs.appendFileSync(path.join(root, 'package.json'), 'tampered')
    expect(verifyIntegrity(root).ok).toBe(false)
  })

  it('rejects leaked source files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanshan-integrity-'))
    makeManifest(root)
    fs.writeFileSync(path.join(root, 'leaked.ts'), 'source')
    const result = verifyIntegrity(root)
    expect(result.issues.some((issue) => issue.includes('leaked.ts'))).toBe(true)
  })

  it('rejects files added after the manifest was created', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanshan-integrity-'))
    makeManifest(root)
    fs.writeFileSync(path.join(root, 'unexpected.txt'), 'tampered')
    const result = verifyIntegrity(root)
    expect(result.issues).toContain('文件未纳入完整性清单: unexpected.txt')
  })
})
