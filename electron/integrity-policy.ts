// Only the startup, account, update, and entitlement boundary belongs in the
// signed integrity manifest. User content and ordinary runtime files stay
// outside it so imports, exports, caches, cookies, and local databases cannot
// break startup.
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

export const INTEGRITY_MUTABLE_PATH_PREFIXES = [
  'data/',
  'exports/',
  'downloads/',
  'cache/',
  'logs/',
  'cookies/',
  'user-data/',
  'tmp/',
  'temp/',
  'vendor/qianshan-runtime/data/',
  'vendor/qianshan-runtime/uploads/',
  'vendor/qianshan-runtime/exports/',
  'vendor/qianshan-runtime/tmp/',
] as const

function normalize(relativePath: string): string {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '')
}

export function isIntegrityMutablePath(relativePath: string): boolean {
  const normalized = normalize(relativePath)
  return INTEGRITY_MUTABLE_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function isIntegrityProtectedPath(relativePath: string): boolean {
  const normalized = normalize(relativePath)
  if (isIntegrityMutablePath(normalized)) return false
  return INTEGRITY_PROTECTED_EXACT_PATHS.includes(normalized as typeof INTEGRITY_PROTECTED_EXACT_PATHS[number])
    || INTEGRITY_PROTECTED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}
