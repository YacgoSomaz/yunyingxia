import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('desktop security configuration', () => {
  it('uses an isolated Electron renderer without remote update code', () => {
    const mainPath = join(root, 'electron', 'main.ts')
    expect(existsSync(mainPath)).toBe(true)

    const main = readFileSync(mainPath, 'utf8')
    expect(main).toContain("title: '万山自媒体'")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('qianshan-runtime')
    expect(main).not.toContain('autoUpdater')
    expect(main).not.toContain('checkForUpdates')

    const preload = readFileSync(join(root, 'electron', 'preload.ts'), 'utf8')
    expect(preload).toContain("exposeInMainWorld('electronAPI'")
    expect(preload).not.toContain('auth:')
    expect(preload).not.toContain('update:')
  })
})
