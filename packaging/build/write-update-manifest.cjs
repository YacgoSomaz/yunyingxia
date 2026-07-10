'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

function yamlString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
    throw new Error('assetBaseUrl must use HTTPS or file URL')
  }
  return parsed.toString().replace(/\/$/, '')
}

function resolveAssetUrl(fileName, assetBaseUrl) {
  const base = normalizeBaseUrl(assetBaseUrl)
  if (!base) return fileName
  return new URL(encodeURIComponent(fileName), `${base}/`).toString()
}

async function fileSha512(filePath) {
  const hash = crypto.createHash('sha512')
  hash.update(await fs.readFile(filePath))
  return hash.digest('base64')
}

async function writeUpdateManifest(options) {
  const outputRoot = path.resolve(options.outputRoot)
  const installerPath = path.resolve(options.installerPath)
  const version = String(options.version || '').trim()
  if (!version) throw new Error('version is required')

  const stat = await fs.stat(installerPath)
  if (!stat.isFile()) throw new Error(`installer is not a file: ${installerPath}`)
  const fileName = path.basename(installerPath)
  const sha512 = await fileSha512(installerPath)
  const releaseDate = options.releaseDate || new Date().toISOString()
  const fileUrl = resolveAssetUrl(fileName, options.assetBaseUrl)
  const manifest = {
    version,
    releaseDate,
    path: fileUrl,
    sha512,
    files: [
      {
        url: fileUrl,
        sha512,
        size: stat.size,
      },
    ],
  }

  const latestJsonPath = path.join(outputRoot, 'latest.json')
  const latestYmlPath = path.join(outputRoot, 'latest.yml')
  await fs.writeFile(latestJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await fs.writeFile(
    latestYmlPath,
    [
      `version: ${yamlString(version)}`,
      `releaseDate: ${yamlString(releaseDate)}`,
      `path: ${yamlString(fileUrl)}`,
      `sha512: ${yamlString(sha512)}`,
      'files:',
      `  - url: ${yamlString(fileUrl)}`,
      `    sha512: ${yamlString(sha512)}`,
      `    size: ${stat.size}`,
      '',
    ].join('\n'),
    'utf8',
  )

  return { latestJsonPath, latestYmlPath, manifest }
}

module.exports = { writeUpdateManifest }

if (require.main === module) {
  const [, , outputRoot, installerPath, version, assetBaseUrl] = process.argv
  if (!outputRoot || !installerPath || !version) {
    console.error('Usage: node write-update-manifest.cjs <output-root> <installer-path> <version> [asset-base-url]')
    process.exit(2)
  }
  writeUpdateManifest({ outputRoot, installerPath, version, assetBaseUrl }).catch((error) => {
    console.error(error?.stack || error)
    process.exit(1)
  })
}
