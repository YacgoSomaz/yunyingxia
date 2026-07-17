import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  RELEASE_EVENT_RECONNECT_DELAY_MS,
  RELEASE_POLL_INTERVAL_MS,
  ReleaseEventMonitor,
  connectReleaseEvents,
  releaseEventsEndpoint,
} from '../electron/release-monitor'
import { createRuntimeReleaseMonitor, requestSignedRelease } from '../electron/update-service'

function publicKeyBase64Url(key: crypto.KeyObject): string {
  return key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64url')
}

function signedResponse(overrides: Record<string, unknown> = {}): { response: Record<string, unknown>; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    typ: 'desktop-release',
    iss: 'https://anyq.site',
    aud: 'operation_shrimp',
    issued_at: now,
    signed_until: now + 3600,
    product_id: 'operation_shrimp',
    version: '0.1.14',
    min_supported_version: '0.1.13',
    mandatory: false,
    installer_url: 'https://download.anyq.site/operation-shrimp/0.1.14/YunyingxiaSetup_0.1.14.exe',
    sha256: 'a'.repeat(64),
    size_bytes: 184920435,
    notes: 'SSE release notice test.',
    published_at: '2026-07-16T12:00:00.000Z',
    ...overrides,
  }
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8')
  return {
    response: {
      ok: true,
      update_release: {
        schema: 'anyq.desktop-update.v1',
        alg: 'Ed25519',
        key_id: 'update-v1',
        payload: bytes.toString('base64url'),
        signature: crypto.sign(null, bytes, privateKey).toString('base64url'),
      },
    },
    publicKey: publicKeyBase64Url(publicKey),
  }
}

describe('runtime signed release monitor', () => {
  it('uses the fixed operation_shrimp SSE endpoint', () => {
    expect(releaseEventsEndpoint('https://anyq.site')).toBe(
      'https://anyq.site/api/v1/releases/events?product_id=operation_shrimp',
    )
  })

  it('accepts only a release SSE event and discards its data payload', async () => {
    const onRelease = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: message\ndata: {"mandatory":true,"installer_url":"https://attacker.example/x.exe"}\n\n'
          + 'event: release\ndata: {"version":"99.99.99","mandatory":true}\n\n',
        ))
      },
    })
    const connection = connectReleaseEvents(
      releaseEventsEndpoint('https://anyq.site'),
      { onRelease, onDisconnected() {} },
      async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } }),
    )

    await vi.waitFor(() => expect(onRelease).toHaveBeenCalledTimes(1))
    expect(onRelease).toHaveBeenCalledWith()
    connection.close()
  })

  it('rechecks only through the signed latest-release request after a release event', async () => {
    const eventHandlers: Array<{ onRelease(): void; onDisconnected(error?: unknown): void }> = []
    const signed = signedResponse()
    const fetcher = vi.fn(async () => new Response(JSON.stringify(signed.response), { status: 200 }))
    const monitor = createRuntimeReleaseMonitor(
      { accountServerUrl: 'https://anyq.site', updatePublicKey: signed.publicKey, version: '0.1.13' },
      () => requestSignedRelease({ accountServerUrl: 'https://anyq.site', updatePublicKey: signed.publicKey, version: '0.1.13' }, fetcher),
      {
        connect: (_endpoint, handlers) => {
          eventHandlers.push(handlers)
          return { close: vi.fn() }
        },
      },
    )

    monitor.start()
    eventHandlers[0].onRelease()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(fetcher).toHaveBeenCalledWith(
      'https://anyq.site/api/v1/releases/latest?product_id=operation_shrimp',
      { headers: { Accept: 'application/json' } },
    )
    monitor.stop()
  })

  it('does not trust event contents and still rejects a tampered signed payload', async () => {
    const eventHandlers: Array<{ onRelease(): void; onDisconnected(error?: unknown): void }> = []
    const signed = signedResponse()
    const tampered = structuredClone(signed.response) as Record<string, any>
    tampered.update_release.payload = Buffer.from(JSON.stringify({ version: '99.99.99', mandatory: true })).toString('base64url')
    const fetcher = vi.fn(async () => new Response(JSON.stringify(tampered), { status: 200 }))
    const check = vi.fn(() => requestSignedRelease(
      { accountServerUrl: 'https://anyq.site', updatePublicKey: signed.publicKey, version: '0.1.13' },
      fetcher,
    ))
    const monitor = createRuntimeReleaseMonitor(
      { accountServerUrl: 'https://anyq.site', updatePublicKey: signed.publicKey, version: '0.1.13' },
      check,
      { connect: (_endpoint, handlers) => { eventHandlers.push(handlers); return { close() {} } } },
    )

    monitor.start()
    eventHandlers[0].onRelease()
    await vi.waitFor(() => expect(check).toHaveBeenCalledTimes(1))
    await expect(check.mock.results[0].value).rejects.toThrow('签名校验失败')
    monitor.stop()
  })

  it('checks every 60 seconds, reconnects after a disconnected stream, and closes on stop', () => {
    vi.useFakeTimers()
    try {
      const eventHandlers: Array<{ onRelease(): void; onDisconnected(error?: unknown): void }> = []
      const close = vi.fn()
      const check = vi.fn()
      const monitor = new ReleaseEventMonitor(
        releaseEventsEndpoint('https://anyq.site'),
        check,
        { connect: (_endpoint, handlers) => { eventHandlers.push(handlers); return { close } } },
      )

      monitor.start()
      monitor.start()
      expect(eventHandlers).toHaveLength(1)

      vi.advanceTimersByTime(RELEASE_POLL_INTERVAL_MS)
      expect(check).toHaveBeenCalledWith('interval')

      eventHandlers[0].onDisconnected(new Error('network lost'))
      vi.advanceTimersByTime(RELEASE_EVENT_RECONNECT_DELAY_MS)
      expect(eventHandlers).toHaveLength(2)

      monitor.stop()
      expect(close).toHaveBeenCalledTimes(2)
      vi.advanceTimersByTime(RELEASE_POLL_INTERVAL_MS + RELEASE_EVENT_RECONNECT_DELAY_MS)
      expect(check).toHaveBeenCalledTimes(1)
      expect(eventHandlers).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
