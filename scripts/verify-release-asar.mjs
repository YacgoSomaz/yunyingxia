import crypto from 'node:crypto'
import { resolve } from 'node:path'
import { extractFile, listPackage } from '@electron/asar'

const archive = resolve(process.argv[2] || 'release/stage/Yunyingxia/resources/app.asar')
const expectedAccountKey = 'CqLAEE2KnduTFtw1gVQIExS1qLRa-XI3TaWpbchMbKc'
const config = JSON.parse(extractFile(archive, 'commercial-config.json').toString('utf8'))
const manifest = JSON.parse(extractFile(archive, 'integrity_manifest.json').toString('utf8'))
const canonical = JSON.stringify({ version: manifest.version, algorithm: manifest.algorithm, files: manifest.files })
const decodeBase64Url = (value) => Buffer.from(String(value).replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64')
const publicKey = crypto.createPublicKey({
  key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), decodeBase64Url(config.integrityPublicKey)]),
  format: 'der',
  type: 'spki',
})
const signatureValid = crypto.verify(null, Buffer.from(canonical, 'utf8'), publicKey, decodeBase64Url(manifest.signature.signature))
const forbidden = listPackage(archive, { isPack: false }).filter((file) =>
  /(^|\/)(?:src|test|tests)(?:\/|$)|\.(?:ts|tsx|map|py|pyc|pem|key|db|sqlite|sqlite3)$/i.test(file) || /(^|\/)\.env/i.test(file),
)

const result = {
  commercial: config.commercial === true,
  productCode: config.productCode,
  accountServerUrl: config.accountServerUrl,
  accountKeyMatches: config.accountPublicKey === expectedAccountKey,
  manifestFiles: Object.keys(manifest.files || {}).length,
  signatureValid,
  forbiddenCount: forbidden.length,
  forbiddenFiles: forbidden.slice(0, 20),
}

console.log(JSON.stringify(result, null, 2))
if (!result.commercial || !result.accountKeyMatches || !signatureValid || forbidden.length) process.exit(1)
