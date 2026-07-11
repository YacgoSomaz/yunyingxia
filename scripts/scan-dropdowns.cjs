'use strict'

const { _electron } = require('playwright')
const path = require('node:path')

const appPath = path.resolve(__dirname, '..')

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

async function main() {
  const app = await _electron.launch({
    executablePath: path.join(appPath, '.runtime-electron/node_modules/electron/dist/electron.exe'),
    args: [appPath],
    env: { ...process.env, WANSHAN_USE_MOCK: '1' },
  })
  const page = await app.firstWindow({ timeout: 60_000 })
  const errors = []
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) errors.push({ type: msg.type(), text: msg.text() })
  })
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', text: error.message }))
  page.on('requestfailed', (request) => errors.push({
    type: 'requestfailed',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`,
  }))

  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3_500)

  async function snapshot(label) {
    return page.evaluate((currentLabel) => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
      }
      const text = (el) => ((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180))
      const controls = [...document.querySelectorAll('select,[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"],button,input,textarea')]
        .filter(visible)
        .map((el, index) => ({
          index,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-haspopup'),
          type: el.getAttribute('type'),
          className: String(el.className || '').slice(0, 100),
          text: text(el),
          placeholder: el.getAttribute('placeholder'),
          value: el.value || '',
          options: el.tagName === 'SELECT' ? [...el.options].map((option) => text(option)) : undefined,
        }))
      return {
        label: currentLabel,
        heading: text(document.querySelector('h1,h2,[class*=title]') || document.body),
        body: text(document.body).slice(0, 1_400),
        controls,
        emptySelects: controls.filter((control) => control.tag === 'select' && (!control.options || control.options.length === 0)),
      }
    }, label)
  }

  async function scanMenus() {
    const candidates = await page.locator('button,[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"],.ant-select-selector').evaluateAll((elements) => {
      const visible = (el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
      }
      const text = (el) => ((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120))
      const pattern = /选择|请选择|风格|平台|类型|分类|模板|预设|模式|账号|日期|状态|排序|全部|更多|生成模式|内容类型|脚本类型|尺寸|比例|声音|模型|频道|来源|Select|Dropdown|Combobox/i
      return elements
        .map((el, index) => ({
          index,
          text: text(el),
          role: el.getAttribute('role'),
          aria: el.getAttribute('aria-haspopup'),
          className: String(el.className || ''),
        }))
        .filter((item) => visible(elements[item.index]) && pattern.test(`${item.text} ${item.role || ''} ${item.aria || ''} ${item.className}`))
    })

    const results = []
    for (const candidate of candidates.slice(0, 36)) {
      try {
        const locator = page.locator('button,[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"],.ant-select-selector').nth(candidate.index)
        await locator.click({ timeout: 1_500 })
        await page.waitForTimeout(350)
        const menus = await page.evaluate(() => {
          const visible = (el) => {
            const rect = el.getBoundingClientRect()
            const style = getComputedStyle(el)
            return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
          }
          const text = (el) => ((el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 220))
          return [...document.querySelectorAll('[role="listbox"],[role="menu"],[role="option"],[role="menuitem"],[data-radix-popper-content-wrapper],[class*="popover"],[class*="dropdown"],[class*="select"]')]
            .filter(visible)
            .map((el) => ({
              tag: el.tagName,
              role: el.getAttribute('role'),
              className: String(el.className || '').slice(0, 100),
              text: text(el),
              optionCount: el.querySelectorAll('[role="option"],[role="menuitem"],li,button,[data-radix-collection-item]').length,
            }))
            .filter((item) => item.text || item.optionCount)
        })
        results.push({ trigger: candidate, menus })
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(100)
      } catch (error) {
        results.push({ trigger: candidate, error: compact(error.message).slice(0, 180) })
      }
    }
    return results
  }

  const report = []
  for (const nav of ['首页', '选题雷达', '文案工坊', '视频工坊', '分发中心', '数据看板', '设置']) {
    const target = page.getByText(nav, { exact: true }).first()
    if (await target.count()) {
      await target.click().catch(() => {})
      await page.waitForTimeout(1_500)
    }
    const pageReport = await snapshot(nav)
    pageReport.menus = await scanMenus()
    report.push(pageReport)
  }

  const result = {
    errors,
    report: report.map((item) => ({
      label: item.label,
      heading: item.heading,
      emptySelects: item.emptySelects,
      controls: item.controls.map((control) => ({
        tag: control.tag,
        role: control.role,
        aria: control.aria,
        text: control.text,
        placeholder: control.placeholder,
        value: control.value,
        options: control.options,
      })).slice(0, 140),
      menus: item.menus,
    })),
  }
  console.log(JSON.stringify(result, null, 2))
  await page.screenshot({ path: path.join(appPath, 'playwright-dropdown-fullscan.png'), fullPage: true })
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
