const crypto = require('node:crypto')
const fs = require('node:fs')

const b64url = (value) => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

function publicKeyFromPrivate(privatePath) {
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8'))
  const der = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  return b64url(der.subarray(-32))
}

const [command, first, second] = process.argv.slice(2)
if (command === 'generate') {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
    publicKeyEncoding: { format: 'der', type: 'spki' },
  })
  fs.writeFileSync(first, privateKey, { encoding: 'utf8', mode: 0o600 })
  process.stdout.write(b64url(publicKey.subarray(-32)))
} else if (command === 'public') {
  process.stdout.write(publicKeyFromPrivate(first))
} else if (command === 'sign') {
  const manifestPath = first
  const privatePath = second
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  delete manifest.signature
  const canonical = JSON.stringify({ version: manifest.version, algorithm: manifest.algorithm, files: manifest.files })
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), crypto.createPrivateKey(fs.readFileSync(privatePath, 'utf8')))
  manifest.signature = { algorithm: 'Ed25519', payload: b64url(Buffer.from(canonical, 'utf8')), signature: b64url(signature) }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
} else {
  throw new Error('usage: generate <private>; public <private>; sign <manifest> <private>')
}
