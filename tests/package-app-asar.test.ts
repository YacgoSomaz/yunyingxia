import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { listPackage } from '@electron/asar'
import { describe, expect, it } from 'vitest'
import { packageAppAsar } from '../packaging/build/package-app.cjs'

describe('packageAppAsar', () => {
  it('packages the release app into a readable Electron ASAR archive', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'wanshan-asar-test-'))
    const sourceRoot = path.join(tempRoot, 'app')
    const archivePath = path.join(tempRoot, 'resources', 'app.asar')

    try {
      await mkdir(path.join(sourceRoot, 'dist-electron'), { recursive: true })
      await mkdir(
        path.join(sourceRoot, 'vendor', 'qianshan-runtime', 'node_modules', '@img', 'sharp-win32-x64', 'lib'),
        { recursive: true },
      )
      await writeFile(path.join(sourceRoot, 'package.json'), '{"main":"dist-electron/main.js"}')
      await writeFile(path.join(sourceRoot, 'dist-electron', 'main.js'), 'module.exports = 1')
      await writeFile(path.join(sourceRoot, 'integrity_manifest.json'), '{"files":{}}')
      await writeFile(
        path.join(
          sourceRoot,
          'vendor',
          'qianshan-runtime',
          'node_modules',
          '@img',
          'sharp-win32-x64',
          'lib',
          'sharp-win32-x64.node',
        ),
        'native',
      )

      await packageAppAsar(sourceRoot, archivePath)

      const entries = (await listPackage(archivePath)).map((entry) => entry.replace(/^[\\/]+/, '').replaceAll('\\', '/'))
      expect(entries).toContain('package.json')
      expect(entries).toContain('dist-electron/main.js')
      expect(await readFile(archivePath)).not.toHaveLength(0)
      await expect(
        stat(
          path.join(
            tempRoot,
            'resources',
            'app.asar.unpacked',
            'vendor',
            'qianshan-runtime',
            'node_modules',
            '@img',
            'sharp-win32-x64',
            'lib',
            'sharp-win32-x64.node',
          ),
        ),
      ).resolves.toMatchObject({ size: 6 })
    } finally {
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
