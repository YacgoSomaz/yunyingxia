'use strict'

const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const appPath = path.resolve(__dirname, '..')
const outputDir = path.join(appPath, 'artifacts')
const outputPath = path.join(outputDir, 'ui-flow-audit.json')

const NAVS = ['首页', '选题雷达', '文案工坊', '视频工坊', '分发中心', '数据看板', '设置']
const UNSAFE_BUTTON = /删除|清空|移除|退出|卸载|封禁|重置|覆盖|确认删除|批量删除/
const SAFE_BUTTON = /刷新|抓取最新|AI 分析|写文案|一键生成文案|AI 拆分镜|生成口语化|生成洞察|立刻采集|导出 CSV|添加账号|新建工作流|文案库|生成视频/
const LOGIN_REQUIRED_BUTTON = /扫码登录|立即校验|全部重新校验|设为抓取号|测试 Edge/

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compact(value, limit = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

async function visibleText(locator) {
  try {
    return compact(await locator.innerText({ timeout: 500 }))
  } catch {
    return ''
  }
}

async function fillKnownInputs(page, nav) {
  if (nav === '文案工坊') {
    const topic = page.getByPlaceholder('例如：夏日露营穿搭分享')
    if (await topic.count()) await topic.fill('夏日露营穿搭分享')
    const notes = page.getByPlaceholder('想突出的卖点、避雷事项等…')
    if (await notes.count()) await notes.fill('目标人群是城市白领，语气自然，突出省时和实用。')
  }
  if (nav === '视频工坊') {
    const script = page.getByPlaceholder(/粘贴或直接输入你的口播文案/)
    if ((await script.count()) === 0) {
      const back = page.getByRole('button', { name: /改文案/ }).first()
      if (await back.count()) {
        await back.click().catch(() => {})
        await page.waitForTimeout(600)
      }
    }
    if (await script.count()) {
      await script.fill('很多人露营前一天才开始收拾，结果不是忘了防晒，就是带了一堆用不上的东西。')
    }
  }
}

async function goNav(page, nav) {
  const item = page.locator('.ant-menu-item').filter({ hasText: nav }).first()
  if (await item.count()) {
    await item.click().catch(() => {})
    await page.waitForTimeout(1000)
  }
}

async function pageSnapshot(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.ant-layout-content') || document.body
    const isVisible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
    }
    const text = (el) => ((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220))
    const buttons = [...main.querySelectorAll('button')]
      .filter(isVisible)
      .map((el, index) => ({ index, text: text(el), disabled: el.disabled, className: String(el.className || '').slice(0, 90) }))
    const selects = [...main.querySelectorAll('.ant-select')]
      .filter(isVisible)
      .map((el, index) => ({ index, text: text(el), className: String(el.className || '').slice(0, 90) }))
    const inputs = [...main.querySelectorAll('input,textarea')]
      .filter(isVisible)
      .map((el) => ({ tag: el.tagName.toLowerCase(), placeholder: el.getAttribute('placeholder'), value: el.value || '' }))
    return {
      body: text(main).slice(0, 1600),
      buttons,
      selects,
      inputs,
    }
  })
}

async function scanSelectOptions(page) {
  const results = []
  const count = await page.locator('.ant-layout-content .ant-select-selector').count()
  for (let index = 0; index < Math.min(count, 18); index++) {
    const selector = page.locator('.ant-layout-content .ant-select-selector').nth(index)
    const label = await visibleText(selector)
    try {
      await selector.click({ timeout: 1500 })
      await page.waitForTimeout(350)
      const options = await page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')
        .evaluateAll((items) => items.map((item) => (item.innerText || item.textContent || '').trim()).filter(Boolean))
      results.push({ index, label, optionCount: options.length, options })
      await page.keyboard.press('Escape').catch(() => {})
    } catch (error) {
      results.push({ index, label, error: compact(error.message) })
    }
  }
  return results
}

async function clickSafeButtons(page, nav) {
  const results = []
  const buttons = await page.locator('.ant-layout-content button').evaluateAll((items) =>
    items.map((el, index) => ({
      index,
      text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' '),
      disabled: el.disabled,
    })),
  )
  for (const button of buttons) {
    if (LOGIN_REQUIRED_BUTTON.test(button.text)) {
      results.push({ text: button.text, ok: null, skipped: 'needs-login-state' })
      continue
    }
    if (!button.text || button.disabled || UNSAFE_BUTTON.test(button.text) || !SAFE_BUTTON.test(button.text)) continue
    if (results.some((item) => item.text === button.text)) continue
    try {
      await goNav(page, nav)
      await fillKnownInputs(page, nav)
      const beforeUrlCount = results.length
      const locator = page.locator('.ant-layout-content button').filter({ hasText: button.text }).first()
      await locator.click({ timeout: 2000 })
      await page.waitForTimeout(/生成|抓取|分析|采集|校验|测试/.test(button.text) ? 2800 : 900)
      const modalText = await page.locator('.ant-modal:visible').first().innerText({ timeout: 500 }).catch(() => '')
      results.push({ text: button.text, ok: true, modal: compact(modalText, 500), beforeUrlCount })
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(200)
    } catch (error) {
      results.push({ text: button.text, ok: false, error: compact(error.message) })
    }
  }
  return results
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const traffic = []
  const errors = []
  const app = await _electron.launch({
    executablePath: path.join(appPath, '.runtime-electron/node_modules/electron/dist/electron.exe'),
    args: [appPath],
    env: { ...process.env, WANSHAN_USE_MOCK: '1' },
  })
  const page = await app.firstWindow({ timeout: 60_000 })

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) errors.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.message }))
  page.on('requestfailed', (request) => errors.push({
    type: 'requestfailed',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`,
  }))
  page.on('response', (response) => {
    const url = response.url()
    if (!url.includes('127.0.0.1:19832/api/')) return
    traffic.push({ status: response.status(), url })
  })

  await page.waitForLoadState('domcontentloaded')
  await sleep(3500)

  const pages = []
  const writeResult = () => {
    const result = {
      capturedAt: new Date().toISOString(),
      errors,
      traffic,
      pages,
      summary: pages.map((pageInfo) => ({
        nav: pageInfo.nav,
        selectCount: (pageInfo.selects || []).length,
        emptySelects: (pageInfo.selects || []).filter((item) => !item.error && item.optionCount === 0).map((item) => item.label),
        failedButtons: (pageInfo.buttonClicks || []).filter((item) => item.ok === false).map((item) => ({ text: item.text, error: item.error })),
        skippedButtons: (pageInfo.buttonClicks || []).filter((item) => item.ok === null).map((item) => ({ text: item.text, reason: item.skipped })),
        clickedButtons: (pageInfo.buttonClicks || []).filter((item) => item.ok !== null).map((item) => ({ text: item.text, ok: item.ok })),
        error: pageInfo.error,
      })),
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
    return result
  }

  for (const nav of NAVS) {
    console.log(`[audit] page ${nav}`)
    try {
      await goNav(page, nav)
      await page.waitForTimeout(600)
      await fillKnownInputs(page, nav)
      const snapshot = await pageSnapshot(page)
      const selects = await scanSelectOptions(page)
      const buttonClicks = await clickSafeButtons(page, nav)
      const screenshotPath = path.join(outputDir, `ui-flow-${nav}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
      pages.push({ nav, screenshotPath, snapshot, selects, buttonClicks })
    } catch (error) {
      pages.push({ nav, error: compact(error.message || error, 1000) })
    }
    writeResult()
  }

  const result = writeResult()

  console.log(JSON.stringify(result.summary, null, 2))
  console.log(`[audit] wrote ${outputPath}`)
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
