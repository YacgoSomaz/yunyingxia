import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyLicenseDocument } from '../electron/license-crypto'

const b64url = (value: Buffer) => value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

describe('license crypto', () => {
  it('verifies the Ed25519 envelope used by license.runmo.art', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const rawPublicKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
    const payload = Buffer.from(JSON.stringify({ product_code: 'wanshan_zimeiti', device_hash: 'device-1', expires_at: 2_000_000_000, grace_until: 2_000_100_000 }))
    const document = {
      alg: 'Ed25519',
      payload: b64url(payload),
      signature: b64url(crypto.sign(null, payload, privateKey)),
    }
    expect(verifyLicenseDocument(document, b64url(rawPublicKey), 'device-1', 'wanshan_zimeiti').product_code).toBe('wanshan_zimeiti')
  })

  it('rejects a license for another product or device', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
    const rawPublicKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)
    const payload = Buffer.from(JSON.stringify({ product_code: 'other', device_hash: 'device-1' }))
    const document = { payload: b64url(payload), signature: b64url(crypto.sign(null, payload, privateKey)) }
    expect(() => verifyLicenseDocument(document, b64url(rawPublicKey), 'device-1', 'wanshan_zimeiti')).toThrow('授权产品不匹配')
  })
})
