import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCommercialConfig } from '../electron/commercial-config'

const root = process.cwd()

describe('desktop security configuration', () => {
  it('requires a signed account login by default when no local config file exists', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'yunyingxia-config-'))
    try {
      const config = loadCommercialConfig(tempRoot)
      expect(config.commercial).toBe(true)
      expect(config.accountServerUrl).toBe('https://anyq.site')
      expect(config.accountPublicKey).not.toBe('')
      expect(config.updatePublicKey).toBe('')
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('uses an isolated Electron renderer with a narrow updater bridge', () => {
    const mainPath = join(root, 'electron', 'main.ts')
    expect(existsSync(mainPath)).toBe(true)

    const main = readFileSync(mainPath, 'utf8')
    expect(main).toContain("title: '运营虾'")
    expect(main).toContain("'Yunyingxia'")
    expect(main).toContain("'WanshanMedia'")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('qianshan-runtime')
    expect(main).toContain('registerUpdateService')
    expect(main).toContain('app.requestSingleInstanceLock()')
    expect(main).toContain("app.on('second-instance'")
    expect(main).toContain('existingWindow.focus()')

    const preload = readFileSync(join(root, 'electron', 'preload.ts'), 'utf8')
    expect(preload).toContain("exposeInMainWorld('electronAPI'")
    expect(preload).toContain('update: {')
    expect(preload).toContain('update:check')
    expect(preload).toContain('update:install')
    expect(preload).not.toContain('auth:')
    expect(preload).not.toContain('licensePublicKey')
    expect(preload).not.toContain('LicensePrivateKey')

    const commercialConfig = readFileSync(join(root, 'electron', 'commercial-config.ts'), 'utf8')
    const accountWindow = readFileSync(join(root, 'electron', 'account-window.ts'), 'utf8')
    const releaseBuild = readFileSync(join(root, 'packaging', 'build', 'build_release.ps1'), 'utf8')
    expect(commercialConfig).toContain('accountPublicKey')
    expect(commercialConfig).toContain('updatePublicKey')
    expect(commercialConfig).toContain("accountPublicKey: 'CqLAEE2KnduTFtw1gVQIExS1qLRa-XI3TaWpbchMbKc'")
    expect(commercialConfig).not.toContain('ACCOUNT_SIGNING_PRIVATE_KEY')
    expect(commercialConfig).not.toMatch(/github\.com\/.*latest\.json/i)
    expect(accountWindow).not.toContain('activeWindow.close = ()')
    expect(accountWindow).toContain('activeWindowAuthenticated = true')
    expect(accountWindow).toContain('class="activation-shell"')
    expect(accountWindow).toContain('class="account-card"')
    expect(accountWindow).toContain('__BACKGROUND_IMAGE_URL__')
    expect(accountWindow).toContain('pathToFileURL')
    expect(accountWindow).toContain('operation-account-login.html')
    expect(releaseBuild).toContain('operation-login-bg.mp4')
    expect(releaseBuild).toContain("[string]$AccountPublicKey = 'CqLAEE2KnduTFtw1gVQIExS1qLRa-XI3TaWpbchMbKc'")
    expect(releaseBuild).toContain('[string]$UpdatePublicKey = \'\'')
    expect(releaseBuild).toContain("'--maxWorkers=1', '--minWorkers=1'")
    expect(main).toContain("'x-wanshan-local-token'")
    expect(main).toContain('onBeforeSendHeaders')
    expect(main).toContain('account.ensureSession()')
    expect(main).not.toContain('account.ensureEntitled()')
    expect(main).toContain("process.env.WANSHAN_OPERATION_ENTITLED = hasActiveAccess(state) ? '1' : '0'")
    expect(main).toContain('if (app.isPackaged)')
  })
})
