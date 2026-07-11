'use strict'

const { _electron } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')

const appPath = path.resolve(__dirname, '..')
const outputDir = path.join(appPath, 'artifacts')
const outputPath = path.join(outputDir, 'playwright-prompt-capture.json')
const cp1252Reverse = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
])

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function compact(value, limit = 6000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return text.length > limit ? `${text.slice(0, limit)}\n...<truncated ${text.length - limit} chars>` : text
}

function parseBody(text, contentType) {
  if (!text) return null
  const bodyText = contentType.includes('text/event-stream') ? repairMojibake(text) : text
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(bodyText)
    } catch {
      return bodyText
    }
  }
  if (contentType.includes('text/event-stream')) {
    return bodyText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return line
        }
      })
  }
  try {
    return JSON.parse(bodyText)
  } catch {
    return bodyText
  }
}

function collectPromptLikeFields(value, prefix = '$', out = []) {
  if (value == null) return out
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPromptLikeFields(item, `${prefix}[${index}]`, out))
    return out
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const nextPath = `${prefix}.${key}`
      if (/prompt|template|style|preset|structure|example|config|content|title/i.test(key)) {
        out.push({ path: nextPath, value: compact(item, 2000) })
      }
      collectPromptLikeFields(item, nextPath, out)
    }
  }
  return out
}

async function captureResponse(response, traffic) {
  const url = response.url()
  if (!url.includes('127.0.0.1:19832/api/')) return
  const headers = response.headers()
  const contentType = headers['content-type'] || ''
  let parsed = null
  let bodyText = ''
  try {
    bodyText = await response.text()
    parsed = parseBody(bodyText, contentType)
  } catch (error) {
    parsed = { captureError: error instanceof Error ? error.message : String(error) }
  }
  traffic.push({
    id: `${Date.now()}-${traffic.length}`,
    phase: 'response',
    status: response.status(),
    url,
    contentType,
    body: parsed,
    promptLikeFields: collectPromptLikeFields(parsed),
  })
}

async function settleResponseTasks(responseTasks) {
  let seen = 0
  for (let pass = 0; pass < 4; pass++) {
    const snapshot = responseTasks.slice()
    await Promise.race([Promise.allSettled(snapshot), sleep(5000)])
    if (responseTasks.length === snapshot.length && responseTasks.length === seen) return
    seen = responseTasks.length
  }
}

function repairMojibake(value) {
  if (!/[ÃÂÅÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/.test(value)) {
    return value
  }
  try {
    const bytes = []
    for (const char of value) {
      const code = char.charCodeAt(0)
      if (code <= 0xff) {
        bytes.push(code)
      } else if (cp1252Reverse.has(char)) {
        bytes.push(cp1252Reverse.get(char))
      } else {
        return value
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes))
  } catch {
    return value
  }
}

async function safeClick(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await locator.click({ timeout: 10_000 })
  console.log(`[click] ${label}`)
}

async function selectAntOption(page, selectIndex, optionText) {
  const selector = page.locator('.ant-select-selector').nth(selectIndex)
  await selector.click()
  await page.waitForTimeout(300)
  await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option', {
    hasText: optionText,
  }).first().click()
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const traffic = []
  const responseTasks = []

  const app = await _electron.launch({
    executablePath: path.join(appPath, '.runtime-electron/node_modules/electron/dist/electron.exe'),
    args: [appPath],
    env: { ...process.env, WANSHAN_USE_MOCK: '1' },
  })
  const page = await app.firstWindow({ timeout: 60_000 })

  page.on('request', (request) => {
    const url = request.url()
    if (!url.includes('127.0.0.1:19832/api/')) return
    traffic.push({
      id: `${Date.now()}-${traffic.length}`,
      phase: 'request',
      method: request.method(),
      url,
      postData: request.postData(),
    })
  })

  page.on('response', (response) => {
    responseTasks.push(captureResponse(response, traffic))
  })

  await page.waitForLoadState('domcontentloaded')
  await sleep(3000)

  await safeClick(page.locator('.ant-menu-item').filter({ hasText: '视频工坊' }), '视频工坊')
  if ((await page.getByPlaceholder(/粘贴或直接输入你的口播文案/).count()) === 0) {
    const backToScript = page.getByRole('button', { name: /改文案/ }).first()
    if (await backToScript.count()) {
      await safeClick(backToScript, '返回文案输入')
      await page.waitForTimeout(800)
    }
  }
  await page.getByPlaceholder(/粘贴或直接输入你的口播文案/).fill(
    '很多人露营前一天才开始收拾，结果不是忘了防晒，就是带了一堆用不上的东西。今天用一分钟讲清楚，夏日轻量露营到底该怎么准备。',
  )
  await selectAntOption(page, 1, '日系清新')
  await safeClick(page.getByRole('button', { name: /AI 拆分镜/ }), 'AI 拆分镜')
  await sleep(9000)

  await safeClick(page.locator('.ant-menu-item').filter({ hasText: '文案工坊' }), '文案工坊')
  await page.getByPlaceholder('例如：夏日露营穿搭分享').fill('夏日露营穿搭分享')
  await selectAntOption(page, 1, '轻松口语')
  await page.getByPlaceholder('想突出的卖点、避雷事项等…').fill('目标人群是城市白领，语气自然，突出省时和实用。')
  const copywritingResponse = page
    .waitForResponse((response) => response.url().includes('/api/copywriting/generate-stream'), { timeout: 60_000 })
    .catch(() => null)
  await safeClick(page.getByRole('button', { name: '一键生成文案' }), '一键生成文案')
  const streamResponse = await copywritingResponse
  if (streamResponse) {
    await Promise.race([streamResponse.finished().catch(() => null), sleep(25_000)])
  }
  await sleep(3000)
  await settleResponseTasks(responseTasks)

  const result = {
    capturedAt: new Date().toISOString(),
    traffic,
    extracted: traffic
      .filter((item) => item.promptLikeFields?.length || /prompt|template|style|preset/i.test(item.postData || ''))
      .map((item) => ({
        phase: item.phase,
        method: item.method,
        status: item.status,
        url: item.url,
        postData: item.postData,
        promptLikeFields: item.promptLikeFields || [],
      })),
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')

  console.log(`\n[capture] wrote ${outputPath}`)
  for (const item of result.extracted) {
    console.log(`\n[${item.phase}] ${item.status || item.method || ''} ${item.url}`)
    if (item.postData) console.log(`postData=${compact(item.postData, 1200)}`)
    for (const field of item.promptLikeFields.slice(0, 20)) {
      console.log(`${field.path}: ${compact(field.value, 1200)}`)
    }
  }

  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
