import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// This module is loaded by the reused Qianshan local Express runtime.
// Keep the verifier dependency-free so it can run before any business route.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { LOCAL_API_TOKEN_HEADER, isLocalApiRequestAllowed, isLocalApiTokenAccepted } = require('../vendor/qianshan-runtime/dist/local-api-auth.js') as {
  LOCAL_API_TOKEN_HEADER: string
  isLocalApiRequestAllowed(expected: unknown, received: unknown, operationEntitled: unknown, method: unknown): boolean
  isLocalApiTokenAccepted(expected: unknown, received: unknown): boolean
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyPaidOperationAccess } = require('../vendor/qianshan-runtime/dist/paid-action-auth.js') as {
  verifyPaidOperationAccess(verifyAccess: unknown, method: unknown): Promise<boolean>
}

describe('local API access token', () => {
  it('accepts only the current process token and rejects missing or altered tokens', () => {
    const token = 'test-process-token-8b0ec3335c8b4c22'
    expect(LOCAL_API_TOKEN_HEADER).toBe('x-wanshan-local-token')
    expect(isLocalApiTokenAccepted(token, token)).toBe(true)
    expect(isLocalApiTokenAccepted(token, '')).toBe(false)
    expect(isLocalApiTokenAccepted(token, `${token}-altered`)).toBe(false)
  })

  it('keeps read-only browsing available but blocks feature actions for ordinary users', () => {
    const token = 'test-process-token-8b0ec3335c8b4c22'
    expect(isLocalApiRequestAllowed(token, token, false, 'GET')).toBe(true)
    expect(isLocalApiRequestAllowed(token, token, false, 'POST')).toBe(false)
    expect(isLocalApiRequestAllowed(token, token, false, 'DELETE')).toBe(false)
    expect(isLocalApiRequestAllowed(token, token, true, 'POST')).toBe(true)
  })

  it('rechecks paid actions and blocks the next action after a membership is disabled', async () => {
    let memberEnabled = true
    const verifyRemoteAccount = async () => memberEnabled
    expect(await verifyPaidOperationAccess(verifyRemoteAccount, 'POST')).toBe(true)
    memberEnabled = false
    expect(await verifyPaidOperationAccess(verifyRemoteAccount, 'POST')).toBe(false)
    expect(await verifyPaidOperationAccess(verifyRemoteAccount, 'GET')).toBe(true)
    expect(await verifyPaidOperationAccess(undefined, 'POST')).toBe(false)
  })

  it('uses the same remote entitlement gate for local routes and publisher IPC', () => {
    const localServer = readFileSync('vendor/qianshan-runtime/dist/server.js', 'utf8')
    const runtimeIpc = readFileSync('vendor/qianshan-runtime/dist/ipc.js', 'utf8')
    expect(localServer).toContain('verifyPaidOperationAccess')
    expect(runtimeIpc).toContain('verifyPaidOperationAccess')
    expect(runtimeIpc).toContain("'publisher:login'")
  })
})
