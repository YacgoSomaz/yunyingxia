const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

async function main() {
  const app = await _electron.launch({
    executablePath: path.join(root, '.runtime-electron', 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [root],
    env: { ...process.env, WANSHAN_USE_MOCK: '0' },
  })
  try {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.setViewportSize({ width: 1440, height: 920 })
    await page.waitForLoadState('domcontentloaded')
    const theme = process.env.THEME
    if (theme === 'light' || theme === 'dark') {
      await page.evaluate((mode) => localStorage.setItem('operating-shrimp-theme-mode', mode), theme)
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
    }
    await page.getByText('选题雷达', { exact: true }).first().click()
    await page.getByRole('button', { name: '抓取最新' }).click()
    const toast = page.getByText('会员专属功能，请开通会员后再试', { exact: true })
    await toast.waitFor({ state: 'visible', timeout: 10_000 })
    await toast.screenshot({ path: path.join(root, 'artifacts', 'permission-toast.png') })
    console.log(JSON.stringify(await toast.evaluate((element) => {
      let node = element
      const chain = []
      for (let index = 0; node && index < 4; index += 1, node = node.parentElement) {
        const style = getComputedStyle(node)
        chain.push({
          tag: node.tagName,
          className: node.className,
          color: style.color,
          background: style.backgroundColor,
        })
      }
      return chain
    }), null, 2))
  } finally {
    await app.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
