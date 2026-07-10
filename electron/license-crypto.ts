import crypto from 'node:crypto'

export interface SignedLicenseDocument {
  alg?: string
  payload: string
  signature: string
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Buffer.from(normalized, 'base64')
}

function publicKeyObject(publicKey: string): crypto.KeyObject {
  if (publicKey.includes('-----BEGIN')) return crypto.createPublicKey(publicKey)
  const raw = decodeBase64Url(publicKey.trim())
  if (raw.length !== 32) throw new Error('Ed25519 公钥长度无效')
  // SubjectPublicKeyInfo prefix for a raw Ed25519 public key.
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw])
  return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

export function verifyEd25519Signature(payload: Buffer, signature: Buffer, publicKey: string): boolean {
  return crypto.verify(null, payload, publicKeyObject(publicKey), signature)
}

export function verifyLicenseDocument(
  document: SignedLicenseDocument,
  publicKey: string,
  expectedDeviceHash: string,
  expectedProductCode: string,
): Record<string, unknown> {
  if (document.alg && document.alg !== 'Ed25519') throw new Error('授权签名算法不受支持')
  const payloadBytes = decodeBase64Url(String(document.payload || ''))
  const signature = decodeBase64Url(String(document.signature || ''))
  if (!verifyEd25519Signature(payloadBytes, signature, publicKey)) throw new Error('授权响应签名校验失败')
  const payload = JSON.parse(payloadBytes.toString('utf8')) as Record<string, unknown>
  if (String(payload.product_code || '') !== expectedProductCode) throw new Error('授权产品不匹配')
  if (String(payload.device_hash || '') !== expectedDeviceHash) throw new Error('授权不属于当前设备')
  return payload
}
