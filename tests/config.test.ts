import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('desktop security configuration', () => {
  it('uses an isolated Electron renderer with a narrow updater bridge', () => {
    const mainPath = join(root, 'electron', 'main.ts')
    expect(existsSync(mainPath)).toBe(true)

    const main = readFileSync(mainPath, 'utf8')
    expect(main).toContain("title: '万山自媒体'")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('qianshan-runtime')
    expect(main).toContain('registerUpdateService')

    const preload = readFileSync(join(root, 'electron', 'preload.ts'), 'utf8')
    expect(preload).toContain("exposeInMainWorld('electronAPI'")
    expect(preload).toContain('update: {')
    expect(preload).toContain('update:check')
    expect(preload).toContain('update:install')
    expect(preload).not.toContain('auth:')
    expect(preload).not.toContain('licensePublicKey')
    expect(preload).not.toContain('LicensePrivateKey')

    const commercialConfig = readFileSync(join(root, 'electron', 'commercial-config.ts'), 'utf8')
    expect(commercialConfig).toContain('https://license.runmo.art/wanshan-media/updates/latest.json')
    expect(commercialConfig).not.toMatch(/github\.com\/.*latest\.json/i)
  })
})
