const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const executablePath = path.resolve(process.argv[2] || path.join(root, 'release', 'stage', 'Yunyingxia', 'Yunyingxia.exe'))
const screenshotPath = path.join(root, 'artifacts', 'packaged-app-smoke.png')

async function main() {
  if (!fs.existsSync(executablePath)) throw new Error(`Packaged executable missing: ${executablePath}`)
  const app = await _electron.launch({ executablePath, args: [] })
  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.yx-sidebar-account').waitFor({ state: 'visible', timeout: 20_000 })
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(JSON.stringify({
      title: await page.title(),
      accountPanel: await page.locator('.yx-sidebar-account').innerText(),
      screenshotPath,
    }, null, 2))
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
