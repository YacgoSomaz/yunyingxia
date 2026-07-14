import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('legacy renderer migration', () => {
  it('loads the copied original renderer through a preload without the old login bridge', () => {
    const renderer = join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist')
    expect(existsSync(join(renderer, 'index.html'))).toBe(true)
    expect(existsSync(join(renderer, 'assets', 'index-BponW6ps.js'))).toBe(true)
    expect(readFileSync(join(renderer, 'index.html'), 'utf8')).toContain('<title>运营虾</title>')
    expect(readFileSync(join(renderer, 'assets', 'index-BponW6ps.js'), 'utf8')).toContain('127.0.0.1:19832')
    expect(readFileSync(join(root, 'vendor', 'qianshan-runtime', 'node_modules', '@qianshan', 'shared', 'dist', 'constants.js'), 'utf8')).toContain('exports.API_PORT = 19832')

    const preload = readFileSync(join(root, 'electron', 'preload.ts'), 'utf8')
    const main = readFileSync(join(root, 'electron', 'main.ts'), 'utf8')
    expect(preload).toContain("'electronAPI'")
    expect(preload).not.toContain('auth:')
    expect(preload).toContain('update:')
    expect(preload).toContain('onDownloaded')
    expect(main).toContain("'qianshan-runtime'")

    const theme = readFileSync(join(root, 'legacy-renderer', 'operating-shrimp-theme.js'), 'utf8')
    const accountWindow = readFileSync(join(root, 'electron', 'account-window.ts'), 'utf8')
    expect(theme).toContain('yx-sidebar-account')
    expect(theme).toContain('const result = await api.me()')
    expect(theme).toContain('openRechargePortal')
    expect(theme).toContain('账号：')
    expect(theme).toContain('退出登录')
    expect(theme).toContain('.ant-message .ant-message-notice-content')
    expect(accountWindow).toContain('activeService?.currentState()')
    expect(main).toContain('registerAccountService(account)')

    const legacyBundle = readFileSync(join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'), 'utf8')
    expect(legacyBundle).toContain('会员专属功能，请开通会员后再试')
  })
})
