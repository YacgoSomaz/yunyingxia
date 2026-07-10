import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeUpdateManifest } from '../packaging/build/write-update-manifest.cjs'

describe('writeUpdateManifest', () => {
  it('writes public update metadata with size and sha512 for the installer', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wanshan-update-manifest-'))
    const installer = path.join(tempRoot, 'WanshanMediaSetup_0.1.4.exe')

    try {
      await writeFile(installer, 'installer bytes')
      const result = await writeUpdateManifest({
        outputRoot: tempRoot,
        installerPath: installer,
        version: '0.1.4',
        releaseDate: '2026-07-11T00:00:00.000Z',
      })

      const latestJson = JSON.parse(await readFile(result.latestJsonPath, 'utf8'))
      expect(latestJson).toMatchObject({
        version: '0.1.4',
        path: 'WanshanMediaSetup_0.1.4.exe',
        files: [
          {
            url: 'WanshanMediaSetup_0.1.4.exe',
            size: 15,
          },
        ],
      })
      expect(latestJson.sha512).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect(latestJson.files[0].sha512).toBe(latestJson.sha512)

      const latestYml = await readFile(result.latestYmlPath, 'utf8')
      expect(latestYml).toContain('version: 0.1.4')
      expect(latestYml).toContain('path: WanshanMediaSetup_0.1.4.exe')
      expect(latestYml).toContain('sha512:')
      expect(latestYml).not.toMatch(/token|secret|private/i)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('can point installer downloads at a domestic object storage URL', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wanshan-update-manifest-'))
    const installer = path.join(tempRoot, 'WanshanMediaSetup_0.1.5.exe')

    try {
      await writeFile(installer, 'new installer bytes')
      const result = await writeUpdateManifest({
        outputRoot: tempRoot,
        installerPath: installer,
        version: '0.1.5',
        releaseDate: '2026-07-11T00:00:00.000Z',
        assetBaseUrl: 'https://wanshan-updates.cos.ap-guangzhou.myqcloud.com/releases',
      })

      const latestJson = JSON.parse(await readFile(result.latestJsonPath, 'utf8'))
      expect(latestJson.path).toBe(
        'https://wanshan-updates.cos.ap-guangzhou.myqcloud.com/releases/WanshanMediaSetup_0.1.5.exe',
      )
      expect(latestJson.files[0].url).toBe(latestJson.path)
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })

  it('rejects non-HTTPS public asset hosts', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wanshan-update-manifest-'))
    const installer = path.join(tempRoot, 'WanshanMediaSetup_0.1.6.exe')

    try {
      await writeFile(installer, 'installer bytes')
      await expect(
        writeUpdateManifest({
          outputRoot: tempRoot,
          installerPath: installer,
          version: '0.1.6',
          assetBaseUrl: 'http://updates.example.com/releases',
        }),
      ).rejects.toThrow('assetBaseUrl must use HTTPS')
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
