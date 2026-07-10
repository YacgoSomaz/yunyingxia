'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')
const { createPackageWithOptions } = require('@electron/asar')

async function packageAppAsar(sourceRoot, archivePath) {
  const source = path.resolve(sourceRoot)
  const target = path.resolve(archivePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.rm(target, { force: true })
  await fs.rm(`${target}.unpacked`, { recursive: true, force: true })
  await createPackageWithOptions(source, target, {
    unpack: '**/*.{node,dll}',
  })
  return target
}

module.exports = { packageAppAsar }

if (require.main === module) {
  const [, , sourceRoot, archivePath] = process.argv
  if (!sourceRoot || !archivePath) {
    console.error('Usage: node package-app.cjs <source-root> <archive-path>')
    process.exit(2)
  }
  packageAppAsar(sourceRoot, archivePath).catch((error) => {
    console.error(error?.stack || error)
    process.exit(1)
  })
}
