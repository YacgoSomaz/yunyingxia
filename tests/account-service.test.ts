import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import crypto from 'node:crypto'
import { AccountService, ACCOUNT_REFRESH_INTERVAL_SECONDS, OPERATION_ENTITLEMENT, OPERATION_PRODUCT_ID, accountProductsFromResponse, hasActiveAccess, isValidPhone, normalizeAccountProducts, normalizeAccountUser, normalizePhone, verifyAccountEnvelope } from '../electron/account-service'

vi.mock('electron', () => ({
  app: { getPath: () => `${process.env.TEMP || process.cwd()}\\yunyingxia-account-service-test` },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}))

afterEach(() => vi.unstubAllGlobals())

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function signedEnvelope(payload: Record<string, unknown>) {
  const keys = crypto.generateKeyPairSync('ed25519')
  return signedEnvelopeWithKeys(payload, keys)
}

function signedEnvelopeWithKeys(payload: Record<string, unknown>, keys: crypto.KeyPairSyncResult<string, string> | crypto.KeyPairSyncResult<Buffer, Buffer>) {
  const payloadText = JSON.stringify(payload)
  const signature = crypto.sign(null, Buffer.from(payloadText), keys.privateKey)
  const publicDer = keys.publicKey.export({ format: 'der', type: 'spki' })
  return {
    publicKey: b64url(Buffer.from(publicDer).subarray(-32)),
    envelope: {
      schema: 'anyq.account-license.v1',
      alg: 'Ed25519',
      key_id: 'account-v1',
      payload: b64url(payloadText),
      signature: b64url(signature),
    },
  }
}

function signedRawEnvelope(payloadText: string) {
  const keys = crypto.generateKeyPairSync('ed25519')
  const signature = crypto.sign(null, Buffer.from(payloadText), keys.privateKey)
  const publicDer = keys.publicKey.export({ format: 'der', type: 'spki' })
  return {
    publicKey: b64url(Buffer.from(publicDer).subarray(-32)),
    envelope: {
      schema: 'anyq.account-license.v1',
      alg: 'Ed25519',
      key_id: 'account-v1',
      payload: b64url(payloadText),
      signature: b64url(signature),
    },
  }
}

describe('account authorization', () => {
  it('normalizes and validates mainland mobile numbers', () => {
    expect(normalizePhone('+8613812345678')).toBe('13812345678')
    expect(normalizePhone('8613812345678')).toBe('13812345678')
    expect(isValidPhone('13812345678')).toBe(true)
    expect(isValidPhone('12812345678')).toBe(false)
  })

  it('keeps ordinary logged-in users without paid access', () => {
    expect(hasActiveAccess({
      id: 1,
      phone: '13812345678',
      energy_balance: 0,
      membership_expires_at: new Date(Date.now() + 86400_000).toISOString(),
    })).toBe(false)
    expect(hasActiveAccess({
      id: 1,
      phone: '13812345678',
      energy_balance: 100,
      membership_expires_at: new Date(Date.now() - 1000).toISOString(),
    })).toBe(false)
  })

  it('never unlocks from unsigned legacy membership fields', () => {
    expect(hasActiveAccess({
      id: 1,
      phone: '13812345678',
      energy_balance: 100,
      membership_expires_at: new Date(Date.now() + 86400_000).toISOString(),
      membership_plan: '月度专业版',
    })).toBe(false)
  })

  it('accepts enriched membership fields from the account server', () => {
    const user = normalizeAccountUser({
      id: 1,
      phone: '13812345678',
      energy_balance: 3000,
      membership_expires_at: '2026-08-01T00:00:00.000Z',
      membership_plan: '月度专业版',
      is_member: true,
      member_level: 'monthly',
      features: ['copywriting', 'video_workshop'],
      server_time: '2026-07-14T00:00:00.000Z',
      remaining_days: 18,
      need_recharge: false,
    })
    expect(user.member_level).toBe('monthly')
    expect(user.features).toEqual(['copywriting', 'video_workshop'])
    expect(user.remaining_days).toBe(18)
    expect(user.need_recharge).toBe(false)
    expect(hasActiveAccess(user)).toBe(false)
  })

  it('normalizes account energy balance aliases for display only', () => {
    expect(normalizeAccountUser({ id: 1, phone: '13812345678', energyBalance: 103000 }).energy_balance).toBe(103000)
    expect(normalizeAccountUser({ id: 1, phone: '13812345678', credits_balance: 8800 }).energy_balance).toBe(8800)
    expect(normalizeAccountUser({ id: 1, phone: '13812345678', availableEnergy: 66 }).energy_balance).toBe(66)
    expect(hasActiveAccess(normalizeAccountUser({ id: 1, phone: '13812345678', energyBalance: 103000 }))).toBe(false)
  })

  it('keeps latest display energy balance when reading a signed cached account', () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 600,
      user: { id: 1, phone: '13812345678', energy_balance: 0 },
      products: [{
        product_id: OPERATION_PRODUCT_ID,
        name: '运营虾',
        status: 'active',
        expires_at: new Date(now + 86_400_000).toISOString(),
        entitlements: [OPERATION_ENTITLEMENT],
      }],
    })
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678', energyBalance: 103000 }, now),
      products: [],
      productsAuthoritative: false,
      accountLicense: envelope,
      signedUntil: issuedAt + 600,
      lastCheckedAt: issuedAt,
    })

    const state = service.currentState()
    expect(hasActiveAccess(state)).toBe(true)
    expect(state?.user.energy_balance).toBe(103000)
    service.clearCache()
  })

  it('derives membership fields for older account responses', () => {
    const user = normalizeAccountUser({
      id: 1,
      phone: '13812345678',
      energy_balance: 3000,
      membership_expires_at: '2026-08-01T00:00:00.000Z',
      membership_plan: '季度专业版',
    }, Date.parse('2026-07-14T00:00:00.000Z'))
    expect(user.is_member).toBe(true)
    expect(user.member_level).toBe('quarterly')
    expect(user.need_recharge).toBe(false)
    expect(user.remaining_days).toBe(18)
    expect(user.features?.length).toBeGreaterThan(0)
  })

  it('unlocks only the operation_shrimp product entitlement from products[]', () => {
    const products = normalizeAccountProducts([{
      product_id: OPERATION_PRODUCT_ID,
      name: '运营虾',
      price_cents: 79900,
      duration_days: 365,
      status: 'active',
      expires_at: '2027-07-14T00:00:00.000Z',
      entitlements: [OPERATION_ENTITLEMENT],
    }])
    expect(hasActiveAccess({
      cookie: '',
      user: normalizeAccountUser({ id: 1, phone: '13812345678', energy_balance: 0 }),
      products,
      productsAuthoritative: true,
      signedUntil: Math.floor(Date.parse('2026-07-14T00:01:00.000Z') / 1000),
      lastCheckedAt: 0,
    }, Date.parse('2026-07-14T00:00:00.000Z'))).toBe(true)
  })

  it('does not unlock operation_shrimp when another product was purchased', () => {
    const products = normalizeAccountProducts([{
      product_id: 'comic_shrimp',
      name: '漫剧虾 + 漫剧精品课程',
      price_cents: 79900,
      duration_days: 365,
      status: 'active',
      expires_at: '2027-07-14T00:00:00.000Z',
      entitlements: ['comic_course'],
    }, {
      product_id: 'replay_shrimp',
      name: '复盘虾 + 运营杀招教程',
      price_cents: 249900,
      duration_days: 365,
      status: 'active',
      expires_at: '2027-07-14T00:00:00.000Z',
      entitlements: ['livewatch'],
    }])
    expect(hasActiveAccess({
      cookie: '',
      user: normalizeAccountUser({ id: 1, phone: '13812345678', energy_balance: 0 }),
      products,
      lastCheckedAt: 0,
    }, Date.parse('2026-07-14T00:00:00.000Z'))).toBe(false)
  })

  it('treats unsigned user.products as display data and never falls back to it', () => {
    const legacyPaidUser = normalizeAccountUser({
      id: 1,
      phone: '13812345678',
      energy_balance: 3000,
      membership_expires_at: '2027-07-14T00:00:00.000Z',
      is_member: true,
    })
    const parsed = accountProductsFromResponse({ user: { ...legacyPaidUser, products: [] } }, legacyPaidUser)
    expect(parsed.authoritative).toBe(false)
    expect(parsed.products).toEqual([])
    expect(hasActiveAccess({ cookie: '', user: legacyPaidUser, products: parsed.products, productsAuthoritative: true, lastCheckedAt: 0 }, Date.parse('2026-07-14T00:00:00.000Z'))).toBe(false)
  })

  it('does not treat root products as an authorization source', () => {
    const parsed = accountProductsFromResponse({
      products: [{ product_id: 'comic_shrimp', status: 'active', expires_at: '2027-07-14T00:00:00.000Z', entitlements: ['comic_course'] }],
      user: {
        products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: '2027-07-14T00:00:00.000Z', entitlements: [OPERATION_ENTITLEMENT] }],
      },
    })
    expect(parsed.authoritative).toBe(false)
    expect(parsed.products).toEqual([])
    expect(hasActiveAccess({
      cookie: '',
      user: normalizeAccountUser({ id: 1, phone: '13812345678', energy_balance: 0 }),
      products: parsed.products,
      productsAuthoritative: false,
      lastCheckedAt: 0,
    }, Date.parse('2026-07-14T00:00:00.000Z'))).toBe(false)
  })

  it('trusts products only after the account envelope signature is valid', () => {
    const issuedAt = '2026-07-14T00:00:00.000Z'
    const issuedAtSeconds = Math.floor(Date.parse(issuedAt) / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAtSeconds,
      signed_until: issuedAtSeconds + 600,
      server_time: issuedAt,
      user: { id: 1, phone: '13812345678', energy_balance: 0, server_time: issuedAt },
      products: [{
        product_id: OPERATION_PRODUCT_ID,
        name: '运营虾',
        price_cents: 79900,
        duration_days: 365,
        status: 'active',
        expires_at: '2027-07-14T00:00:00.000Z',
        entitlements: [OPERATION_ENTITLEMENT],
      }],
    })
    const trusted = verifyAccountEnvelope(envelope, publicKey, Date.parse(issuedAt))
    expect(hasActiveAccess({
      cookie: '',
      user: trusted.user,
      products: trusted.products,
      productsAuthoritative: true,
      signedUntil: trusted.signedUntil,
      lastCheckedAt: 0,
    }, Date.parse(issuedAt))).toBe(true)
  })

  it('does not unlock when a valid account envelope omits this product', () => {
    const issuedAt = '2026-07-14T00:00:00.000Z'
    const issuedAtSeconds = Math.floor(Date.parse(issuedAt) / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAtSeconds,
      signed_until: issuedAtSeconds + 600,
      server_time: issuedAt,
      user: { id: 1, phone: '13812345678', energy_balance: 9999, membership_expires_at: '2027-07-14T00:00:00.000Z' },
      products: [],
    })
    const trusted = verifyAccountEnvelope(envelope, publicKey, Date.parse(issuedAt))
    expect(hasActiveAccess({ cookie: '', user: trusted.user, products: trusted.products, productsAuthoritative: true, signedUntil: trusted.signedUntil, lastCheckedAt: 0 }, Date.parse(issuedAt))).toBe(false)
  })

  it('rejects captured account envelopes when products are tampered with', () => {
    const issuedAt = '2026-07-14T00:00:00.000Z'
    const issuedAtSeconds = Math.floor(Date.parse(issuedAt) / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAtSeconds,
      signed_until: issuedAtSeconds + 600,
      server_time: issuedAt,
      user: { id: 1, phone: '13812345678', energy_balance: 0, server_time: issuedAt },
      products: [],
    })
    const tampered = {
      ...envelope,
      payload: b64url(JSON.stringify({
        typ: 'anyq.account-license.v1',
        iss: 'https://anyq.site',
        aud: OPERATION_PRODUCT_ID,
        issued_at: issuedAtSeconds,
        signed_until: issuedAtSeconds + 600,
        server_time: issuedAt,
        user: { id: 1, phone: '13812345678', energy_balance: 0, server_time: issuedAt },
        products: [{
          product_id: OPERATION_PRODUCT_ID,
          name: '运营虾',
          status: 'active',
          expires_at: '2027-07-14T00:00:00.000Z',
          entitlements: [OPERATION_ENTITLEMENT],
        }],
      })),
    }
    expect(() => verifyAccountEnvelope(tampered, publicKey, Date.parse(issuedAt))).toThrow('账号授权包签名校验失败')
  })

  it('rejects a valid signature for another product audience', () => {
    const issuedAt = '2026-07-14T00:00:00.000Z'
    const issuedAtSeconds = Math.floor(Date.parse(issuedAt) / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: 'comic_shrimp',
      issued_at: issuedAtSeconds,
      signed_until: issuedAtSeconds + 600,
      server_time: issuedAt,
      user: { id: 1, phone: '13812345678', role: 'regular', server_time: issuedAt },
      products: [{
        product_id: OPERATION_PRODUCT_ID,
        status: 'active',
        expires_at: '2027-07-14T00:00:00.000Z',
        entitlements: [OPERATION_ENTITLEMENT],
      }],
    })
    expect(() => verifyAccountEnvelope(envelope, publicKey, Date.parse(issuedAt))).toThrow('账号授权包产品不匹配')
  })

  it('rejects an expired account license even when its signature is valid', () => {
    const issuedAt = '2026-07-14T00:00:00.000Z'
    const issuedAtSeconds = Math.floor(Date.parse(issuedAt) / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAtSeconds,
      signed_until: issuedAtSeconds + 600,
      server_time: issuedAt,
      user: { id: 1, phone: '13812345678', role: 'regular', server_time: issuedAt },
      products: [{
        product_id: OPERATION_PRODUCT_ID,
        status: 'active',
        expires_at: '2027-07-14T00:00:00.000Z',
        entitlements: [OPERATION_ENTITLEMENT],
      }],
    })
    expect(() => verifyAccountEnvelope(envelope, publicKey, Date.parse(issuedAt) + 15 * 60_000)).toThrow('账号授权包已过期')
  })

  it('refreshes account authorization every 10 seconds and no longer boots through card keys', () => {
    expect(ACCOUNT_REFRESH_INTERVAL_SECONDS).toBe(10)
    const main = readFileSync('electron/main.ts', 'utf8')
    const preload = readFileSync('electron/preload.ts', 'utf8')
    expect(main).toContain('account.startBackgroundRefresh')
    expect(main).toContain('showAccountWindow')
    expect(main).not.toContain('showLicenseWindow')
    expect(main).not.toContain("dialog.showErrorBox('运营虾登录失败', '请使用手机号登录后再启动运营虾。')")
    expect(main).toContain('if (!loggedIn) {\n      accountBootInProgress = false\n      app.quit()')
    expect(main).toContain('let accountLoginPending = false')
    expect(main).toContain('let accountBootInProgress = false')
    expect(main).toContain('accountBootInProgress = true')
    expect(main).toContain('accountLoginPending = true')
    expect(main).toContain('accountLoginPending = false')
    expect(main).toContain('if (accountLoginPending || accountBootInProgress) return')
    expect(preload).toContain('account:sendCode')
    expect(preload).toContain('account:openRechargePortal')
    expect(preload).not.toContain('account:createWechatOrder')
    expect(preload).not.toContain('account:orderStatus')
    expect(preload).not.toContain('license:activate')
  })

  it('uses a single-use remote web handoff instead of opening the portal directly', () => {
    const service = readFileSync('electron/account-service.ts', 'utf8')
    const window = readFileSync('electron/account-window.ts', 'utf8')
    expect(service).toContain("/api/auth/web-handoff")
    expect(window).toContain('createWebHandoff')
    expect(window).not.toContain('rechargePortalUrl()')
  })

  it('uses the frozen product header and has no unsigned-account fallback', () => {
    const service = readFileSync('electron/account-service.ts', 'utf8')
    expect(service).toContain("'x-product-code': OPERATION_PRODUCT_ID")
    expect(service).not.toContain("'x-anyq-product': OPERATION_PRODUCT_ID")
    expect(service).toContain("if (!publicKey) throw new Error('账号验签公钥未配置')")
  })

  it('clears a signed local entitlement when the account server disables the member', async () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 60,
      user: { id: 1, phone: '13812345678' },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
    })
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678' }, now),
      products: normalizeAccountProducts([{
        product_id: OPERATION_PRODUCT_ID,
        name: '运营虾',
        status: 'active',
        expires_at: new Date(now + 86_400_000).toISOString(),
        entitlements: [OPERATION_ENTITLEMENT],
      }]),
      productsAuthoritative: true,
      accountLicense: envelope,
      signedUntil: issuedAt + 60,
      lastCheckedAt: Math.floor(now / 1000),
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: '会员已停用' }),
      headers: { get: () => null },
    })))

    const result = await service.verifyOperationEntitlement()
    expect(result).toEqual({ state: null, entitled: false, source: 'denied' })
    expect(service.currentState()).toBeNull()
    service.clearCache()
  })

  it('removes local entitlement when the signed account license no longer grants operation_course', async () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000)
    const keys = crypto.generateKeyPairSync('ed25519')
    const { publicKey, envelope: activeEnvelope } = signedEnvelopeWithKeys({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 60,
      user: { id: 1, phone: '13812345678' },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
    }, keys)
    const { envelope: inactiveEnvelope } = signedEnvelopeWithKeys({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 60,
      user: { id: 1, phone: '13812345678', energy_balance: 9999, membership_expires_at: new Date(now + 86_400_000).toISOString() },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [] }],
    }, keys)
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678' }, now),
      products: normalizeAccountProducts([{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }]),
      productsAuthoritative: true,
      accountLicense: activeEnvelope,
      signedUntil: issuedAt + 60,
      lastCheckedAt: Math.floor(now / 1000),
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        user: { id: 1, phone: '13812345678' },
        products: [{ product_id: OPERATION_PRODUCT_ID, status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
        membership_expires_at: new Date(now + 86_400_000).toISOString(),
        energy_balance: 9999,
        account_license: inactiveEnvelope,
      }),
      headers: { get: () => null },
    })))

    const result = await service.verifyOperationEntitlement()
    expect(result.source).toBe('remote')
    expect(result.entitled).toBe(false)
    expect(hasActiveAccess(result.state)).toBe(false)
    expect(hasActiveAccess(service.currentState())).toBe(false)
    service.clearCache()
  })

  it('keeps a signed entitlement only until signed_until during a network failure', async () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 60,
      user: { id: 1, phone: '13812345678' },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
    })
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678' }, now),
      products: normalizeAccountProducts([{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }]),
      productsAuthoritative: true,
      accountLicense: envelope,
      signedUntil: issuedAt + 60,
      lastCheckedAt: Math.floor(now / 1000),
    })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network unavailable') }))

    const result = await service.verifyOperationEntitlement()
    expect(result.source).toBe('cached-network')
    expect(result.entitled).toBe(true)
    service.clearCache()
  })

  it('uses an expired signed cache only as a cookie holder so startup can refresh from the server', async () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000) - 900
    const refreshedAt = Math.floor(now / 1000)
    const keys = crypto.generateKeyPairSync('ed25519')
    const { publicKey, envelope: expiredEnvelope } = signedEnvelopeWithKeys({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 600,
      user: { id: 1, phone: '13812345678' },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
    }, keys)
    const { envelope: freshEnvelope } = signedEnvelopeWithKeys({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: refreshedAt,
      signed_until: refreshedAt + 600,
      user: { id: 1, phone: '13812345678' },
      products: [{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }],
    }, keys)
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678' }, now),
      products: normalizeAccountProducts([{ product_id: OPERATION_PRODUCT_ID, name: '运营虾', status: 'active', expires_at: new Date(now + 86_400_000).toISOString(), entitlements: [OPERATION_ENTITLEMENT] }]),
      productsAuthoritative: true,
      accountLicense: expiredEnvelope,
      signedUntil: issuedAt + 600,
      lastCheckedAt: refreshedAt - 1,
    })
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: { headers?: Record<string, string> }) => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        user: { id: 1, phone: '13812345678' },
        account_license: freshEnvelope,
      }),
      headers: { get: () => null },
      requestCookie: options.headers?.cookie,
    })))

    const state = await service.ensureSession()
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/me'), expect.objectContaining({
      headers: expect.objectContaining({
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      }),
    }))
    expect(state?.cookie).toBe('session=test')
    expect(hasActiveAccess(state)).toBe(true)
    service.clearCache()
  })

  it('uses the signed license for entitlement while showing the latest root user energy balance', async () => {
    const now = Date.now()
    const issuedAt = Math.floor(now / 1000)
    const { publicKey, envelope } = signedEnvelope({
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: issuedAt,
      signed_until: issuedAt + 600,
      user: { id: 1, phone: '13812345678', energy_balance: 0 },
      products: [{
        product_id: OPERATION_PRODUCT_ID,
        name: '运营虾',
        status: 'active',
        expires_at: new Date(now + 86_400_000).toISOString(),
        entitlements: [OPERATION_ENTITLEMENT],
      }],
    })
    const service = new AccountService({
      commercial: true,
      licenseServerUrl: 'https://license.runmo.art',
      licensePublicKey: '',
      accountServerUrl: 'https://anyq.site',
      accountPublicKey: publicKey,
      updatePublicKey: '',
      integrityPublicKey: '',
      offlineGraceHours: 0,
      productCode: OPERATION_PRODUCT_ID,
      appName: '运营虾',
      version: '0.1.15',
    })
    service.clearCache()
    ;(service as unknown as { writeCache(state: unknown): void }).writeCache({
      cookie: 'session=test',
      user: normalizeAccountUser({ id: 1, phone: '13812345678', energy_balance: 0 }, now),
      products: [],
      productsAuthoritative: false,
      lastCheckedAt: issuedAt,
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        user: { id: 1, phone: '13812345678', energy_balance: 103000 },
        account_license: envelope,
      }),
      headers: { get: () => null },
    })))

    const state = await service.ensureSession()
    expect(hasActiveAccess(state)).toBe(true)
    expect(state?.user.energy_balance).toBe(103000)
    service.clearCache()
  })

  it('rejects missing algorithms, duplicate JSON keys, and invalid signed time ranges', () => {
    const now = 1_700_000_000
    const base = {
      typ: 'anyq.account-license.v1',
      iss: 'https://anyq.site',
      aud: OPERATION_PRODUCT_ID,
      issued_at: now,
      signed_until: now + 600,
      user: { id: 1, phone: '13812345678', role: 'regular' },
      products: [],
    }
    const { publicKey, envelope } = signedEnvelope(base)
    const missingAlgorithm = { ...envelope, alg: undefined }
    expect(() => verifyAccountEnvelope(missingAlgorithm, publicKey, now * 1000)).toThrow('签名算法')

    const duplicate = signedRawEnvelope(`{"typ":"anyq.account-license.v1","\\u0074yp":"anyq.account-license.v1","iss":"https://anyq.site","aud":"operation_shrimp","issued_at":${now},"signed_until":${now + 600},"user":{"id":1,"phone":"13812345678","role":"regular"},"products":[]}`)
    expect(() => verifyAccountEnvelope(duplicate.envelope, duplicate.publicKey, now * 1000)).toThrow('重复字段')

    const backwards = signedEnvelope({ ...base, issued_at: now + 100, signed_until: now + 50 })
    expect(() => verifyAccountEnvelope(backwards.envelope, backwards.publicKey, now * 1000)).toThrow('时间')
  })
})
