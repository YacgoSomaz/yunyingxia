import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { verifyEd25519Signature } from './license-crypto'
import { INTEGRITY_PROTECTED_EXACT_PATHS } from './integrity-policy'

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

  for (const relative of INTEGRITY_PROTECTED_EXACT_PATHS) {
    if (!fs.existsSync(path.join(root, relative))) issues.push(`缺少运行必需文件: ${relative}`)
  }

  return { ok: issues.length === 0, issues }
}
