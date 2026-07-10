import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { verifyEd25519Signature } from './license-crypto'

export interface IntegrityManifestEntry {
  sha256: string
  size: number
}

export interface IntegrityManifest {
  version: number
  algorithm: 'sha256'
  files: Record<string, IntegrityManifestEntry>
  signature: {
    algorithm: 'Ed25519'
    payload: string
    signature: string
  }
}

export interface IntegrityResult {
  ok: boolean
  issues: string[]
}

const FORBIDDEN_FILE = /(^|[\\/])(?:\.env(?:\.|$)|tests?(?:[\\/]|$)|logs?(?:[\\/]|$)|cookies?(?:[\\/]|$)|.*\.(?:py|pyc|ts|tsx|map|d\.ts|db|sqlite|sqlite3|pem|key))$/i

function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function base64Url(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function allFiles(root: string): string[] {
  const result: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else result.push(full)
    }
  }
  walk(root)
  return result
}

export function hasDebuggerFlags(): boolean {
  const args = [...process.execArgv, process.env.NODE_OPTIONS || ''].join(' ')
  return /(?:--inspect(?:-brk)?(?:=|\b)|--remote-debugging-port(?:=|\b))/i.test(args)
}

export function verifyIntegrity(root: string, manifestPath = path.join(root, 'integrity_manifest.json'), integrityPublicKey = ''): IntegrityResult {
  const issues: string[] = []
  if (hasDebuggerFlags()) issues.push('检测到调试器参数')

  if (!fs.existsSync(manifestPath)) {
    issues.push('缺少 integrity_manifest.json')
    return { ok: false, issues }
  }

  let manifest: IntegrityManifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as IntegrityManifest
  } catch {
    issues.push('完整性清单格式无效')
    return { ok: false, issues }
  }

  if (manifest.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object' || !manifest.signature) {
    issues.push('完整性清单算法或文件表无效')
    return { ok: false, issues }
  }

  if (!integrityPublicKey) {
    issues.push('缺少完整性清单公钥')
  } else {
    try {
      const canonical = JSON.stringify({ version: manifest.version, algorithm: manifest.algorithm, files: manifest.files })
      const expectedPayload = base64Url(Buffer.from(canonical, 'utf8'))
      const signatureText = manifest.signature.signature.replace(/-/g, '+').replace(/_/g, '/')
      const signature = Buffer.from(signatureText + '='.repeat((4 - (signatureText.length % 4)) % 4), 'base64')
      if (manifest.signature.algorithm !== 'Ed25519' || manifest.signature.payload !== expectedPayload) {
        issues.push('完整性清单签名载荷无效')
      } else if (!verifyEd25519Signature(Buffer.from(canonical, 'utf8'), signature, integrityPublicKey)) {
        issues.push('完整性清单签名校验失败')
      }
    } catch {
      issues.push('完整性清单签名格式无效')
    }
  }

  for (const [relative, expected] of Object.entries(manifest.files)) {
    const target = path.resolve(root, relative)
    if (!isInside(root, target)) {
      issues.push(`清单包含越界路径: ${relative}`)
      continue
    }
    if (!fs.existsSync(target)) {
      issues.push(`关键文件缺失: ${relative}`)
      continue
    }
    const stat = fs.statSync(target)
    if (!stat.isFile() || stat.size !== expected.size || sha256(target) !== expected.sha256) {
      issues.push(`文件校验失败: ${relative}`)
    }
  }

  for (const file of allFiles(root)) {
    const relative = relativeFile(root, file)
    if (relative === 'integrity_manifest.json') continue
    if (!Object.prototype.hasOwnProperty.call(manifest.files, relative)) issues.push(`文件未纳入完整性清单: ${relative}`)
    if (FORBIDDEN_FILE.test(relative)) issues.push(`发布包含敏感或源码文件: ${relative}`)
  }

  const required = [
    'package.json',
    'dist-electron/electron/main.js',
    'vendor/qianshan-runtime/dist/server.js',
    'vendor/qianshan-runtime/renderer/dist/index.html',
  ]
  for (const relative of required) {
    if (!fs.existsSync(path.join(root, relative))) issues.push(`缺少运行必需文件: ${relative}`)
  }

  return { ok: issues.length === 0, issues }
}
