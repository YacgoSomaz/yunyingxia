// Only the explicit startup and entitlement boundary belongs in the signed
// integrity manifest. User content and ordinary runtime files stay outside it.
export const INTEGRITY_PROTECTED_EXACT_PATHS = [
  'package.json',
  'dist-electron/electron/main.js',
  'dist-electron/electron/preload.js',
  'dist-electron/electron/commercial-config.js',
  'dist-electron/electron/account-service.js',
  'dist-electron/electron/account-window.js',
  'dist-electron/electron/license-crypto.js',
  'dist-electron/electron/integrity-policy.js',
  'dist-electron/electron/integrity-verifier.js',
  'dist-electron/electron/release-verifier.js',
  'dist-electron/electron/release-monitor.js',
  'dist-electron/electron/update-service.js',
  'dist-electron/electron/update-window.js',
  'dist-electron/electron/legacy-seed.js',
  'vendor/qianshan-runtime/dist/server.js',
  'vendor/qianshan-runtime/dist/ipc.js',
  'vendor/qianshan-runtime/dist/paid-action-auth.js',
] as const

export const INTEGRITY_PROTECTED_PATH_PREFIXES: readonly string[] = []

function normalize(relativePath: string): string {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isIntegrityProtectedPath(relativePath: string): boolean {
  const normalized = normalize(relativePath)
  return INTEGRITY_PROTECTED_EXACT_PATHS.includes(normalized as typeof INTEGRITY_PROTECTED_EXACT_PATHS[number])
    || INTEGRITY_PROTECTED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}
