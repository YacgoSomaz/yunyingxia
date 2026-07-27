const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, 'artifacts')
const screenshotPath = path.join(outputDir, 'debug-account-balance.png')
const outputPath = path.join(outputDir, 'debug-account-balance.json')

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
    await panel.waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(1200)

    const beforePanel = await panel.innerText()
    const accountMe = await page.evaluate(async () => window.electronAPI.account.me())
    const catalog = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:19832/api/llm/official-catalog', {
        headers: { accept: 'application/json' },
      })
      return { status: res.status, body: await res.json().catch(() => null) }
    })
    await page.waitForTimeout(1500)
    const afterPanel = await panel.innerText()
    await panel.screenshot({ path: screenshotPath })

    const result = {
      screenshotPath,
      beforePanel,
      afterPanel,
      accountMe,
      catalog,
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
