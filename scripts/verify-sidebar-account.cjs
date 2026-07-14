const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, 'artifacts')
const outputPath = path.join(outputDir, 'sidebar-account.png')

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const app = await _electron.launch({
    executablePath: path.join(root, '.runtime-electron', 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [root],
    env: { ...process.env, WANSHAN_USE_MOCK: '0' },
  })

  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.waitForLoadState('domcontentloaded')
    const panel = page.locator('.yx-sidebar-account')
    await panel.waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('button', { name: '去官网开通' }).waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '退出登录' }).waitFor({ state: 'visible' })
    await page.waitForTimeout(400)
    await page.screenshot({ path: outputPath, fullPage: true })

    const result = await panel.innerText()
    if (!result.includes('账号：')) throw new Error(`Missing account identity: ${result}`)
    console.log(JSON.stringify({ outputPath, accountPanel: result }, null, 2))
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
