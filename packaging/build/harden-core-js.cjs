const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')
const JavaScriptObfuscator = require('javascript-obfuscator')

const root = process.argv[2]
if (!root) {
  console.error('Usage: node harden-core-js.cjs <app-root>')
  process.exit(2)
}

const coreFiles = [
  'dist-electron/electron/account-service.js',
  'dist-electron/electron/account-window.js',
  'dist-electron/electron/commercial-config.js',
  'dist-electron/electron/integrity-policy.js',
  'dist-electron/electron/integrity-verifier.js',
  'dist-electron/electron/license-crypto.js',
  'dist-electron/electron/main.js',
  'dist-electron/electron/preload.js',
  'dist-electron/electron/release-monitor.js',
  'dist-electron/electron/release-verifier.js',
  'dist-electron/electron/update-service.js',
  'dist-electron/electron/update-window.js',
  'vendor/qianshan-runtime/dist/ipc.js',
  'vendor/qianshan-runtime/dist/paid-action-auth.js',
  'vendor/qianshan-runtime/dist/server.js',
  'vendor/qianshan-runtime/dist/services/official-ai-client.js',
]

let changed = 0
for (const relative of coreFiles) {
  const file = path.join(root, relative)
  if (!fs.existsSync(file)) continue
  const source = fs.readFileSync(file, 'utf8')
  const minified = esbuild.transformSync(source, {
    loader: 'js',
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    minify: true,
    legalComments: 'none',
    sourcemap: false,
  }).code
  const hardened = JavaScriptObfuscator.obfuscate(minified, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.6,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.12,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 8,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.55,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayThreshold: 0.85,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
  }).getObfuscatedCode()
  fs.writeFileSync(file, `${hardened}\n`, 'utf8')
  changed += 1
}

if (changed < 10) {
  throw new Error(`核心 JS 硬化文件数量异常: ${changed}`)
}

console.log(`hardened ${changed} core js files`)
