import { describe, expect, it } from 'vitest'
import { buildLicenseRequestBody } from '../electron/license-service'

describe('license request body', () => {
  it('includes the Wanshan product code in activation requests', () => {
    expect(buildLicenseRequestBody({ card_key: 'TEST', device_hash: 'device' }, 'wanshan_media')).toEqual({
      card_key: 'TEST',
      device_hash: 'device',
      product_code: 'wanshan_media',
    })
  })
})
