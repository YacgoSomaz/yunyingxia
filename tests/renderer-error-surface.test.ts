import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('renderer error surface', () => {
  it('keeps runtime failures compact and non-blocking', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('操作错误，稍后再试')
      expect(theme).toContain('window.addEventListener(\'error\'')
      expect(theme).toContain('window.addEventListener(\'unhandledrejection\'')
      expect(theme).toContain('Unexpected Application Error!')
      expect(theme).toContain("querySelectorAll('pre').forEach((node) => node.remove())")
    }
  })

  it('scrubs qianshan links from user-facing renderer pages', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('function scrubQianshanLinks()')
      expect(theme).toContain("querySelectorAll('a[href], .ant-typography a[href]')")
      expect(theme).toContain("link.replaceWith(span)")
      expect(theme).toContain('qianshanai\\.cn')
    }
  })

  it('does not ship React Router raw-stack fallback text', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).not.toContain('Unexpected Application Error!')
      expect(bundle).toContain('操作错误，稍后再试')
    }
  })

  it('waits for BGM audio readiness and ignores interrupted play requests', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).toContain('__yxBgmPlayToken')
      expect(bundle).toContain('canplay')
      expect(bundle).toContain('interrupted by a new load request')
      expect(bundle).not.toContain('s.src=P;try{await s.play(),l(E.id)}catch')
    }
  })

  it('persists topic radar, copywriting, and video workspace draft state locally', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).toContain('yx.cache.topic')
      expect(bundle).toContain('yx.cache.copywriting.gen')
      expect(bundle).toContain('yx.cache.copywriting.rewrite')
      expect(bundle).toContain('localStorage.setItem("yx.cache.topic"')
      expect(bundle).toContain('localStorage.setItem("yx.cache.copywriting.gen"')
      expect(bundle).toContain('localStorage.setItem("yx.cache.copywriting.rewrite"')
    }

    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('WORKSPACE_CACHE_PREFIX')
      expect(theme).toContain('installWorkspaceCache')
      expect(theme).toContain('/\\/video/.test(route)')
      expect(theme).toContain('function coverFieldCacheName(el)')
      expect(theme).toContain('return `cover:${key.trim().slice(0, 80)}`')
      expect(theme).toContain('封面参数|生成封面|已生成封面')
      expect(theme).toContain('input, textarea, select')
      expect(theme).toContain('function isVisibleWorkspaceControl(el)')
      expect(theme).toContain('if (!isVisibleWorkspaceControl(el)) continue')
      expect(theme).toContain('if (!isVisibleWorkspaceControl(target)) return')
      expect(theme).toContain("document.addEventListener('input', persist, true)")
      expect(theme).toContain("document.addEventListener('blur', persist, true)")
      expect(theme).toContain('setTimeout(restoreWorkspaceCache, 1200)')
    }
  })

  it('keeps generated scene prompt text readable in both themes', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('function markScenePromptPanels()')
      expect(theme).toContain('yx-scene-prompt-panel')
      expect(theme).toContain('AI 视频 prompt')
      expect(theme).toContain('color: #1f2937 !important')
      expect(theme).toContain('body[data-yx-theme="dark"] .yx-scene-prompt-panel')
      expect(theme).toContain('color: #e6edf3 !important')
    }
  })

  it('uses image file filters when publishing image or article works', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).toContain('const z=P==="video"?[{name:"视频",extensions:["mp4","mov","m4v","flv","avi","mkv"]}]:[{name:"图片",extensions:["jpg","jpeg","png","webp","gif","bmp","avif"]}]')
      expect(bundle).not.toContain('selectFiles({filters:[{name:"视频",extensions:["mp4","mov","m4v","flv","avi","mkv"]},{name:"图片",extensions:["jpg","jpeg","png","webp"]}]})')
    }
  })

  it('does not imply video generation survives app exit', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).toContain('关闭此弹窗不影响当前生成，但退出软件会停止生成')
      expect(bundle).toContain('收起弹窗')
      expect(bundle).not.toContain('关闭此弹窗也不会打断生成')
      expect(bundle).not.toContain('后台运行')
    }
  })

  it('marks platform accounts expired when publish preflight or publish execution finds an expired cookie', () => {
    const distribute = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'distribute.js'),
      'utf8',
    )

    expect(distribute).toContain('function isAccountExpiredError')
    expect(distribute).toContain('async function markAccountExpired')
    expect(distribute).toContain('const authCheck = await this.verifyAccount(task.accountId)')
    expect(distribute).toContain('账号登录已过期，请到「账号管理」重新扫码登录')
    expect(distribute).toContain('await markAccountExpired(task.accountId, msg)')
    expect(distribute).toContain("verifyStatus: 'expired'")
    expect(distribute).toContain("verifyStatus: 'ok'")
    expect(distribute).toContain('const error = String(e?.message || e)')
  })

  it('avoids false expired states for platform cookies and Douyin logged-in redirects', () => {
    const browserAutomation = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'publishers', 'browser-automation.js'),
      'utf8',
    )
    const publisherBase = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'publishers', 'base.js'),
      'utf8',
    )
    const douyinPublisher = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'publishers', 'douyin.js'),
      'utf8',
    )
    const scraperBase = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'topic-scrapers', 'base.js'),
      'utf8',
    )
    const douyinScraper = readFileSync(
      join(root, 'vendor', 'qianshan-runtime', 'dist', 'services', 'topic-scrapers', 'douyin.js'),
      'utf8',
    )

    expect(browserAutomation).toContain('Array.isArray(domain) ? domain : [domain]')
    expect(browserAutomation).toContain('cookieDomain === base || cookieDomain.endsWith(`.${base}`)')
    expect(publisherBase).toContain('this.cookieDomains || this.cookieDomain')
    expect(publisherBase).toContain('async hasLoggedInPageSignal')
    expect(publisherBase).toContain('!this.isExplicitLoginUrl(finalUrl)')
    expect(douyinPublisher).toContain("cookieDomains = ['.douyin.com', 'douyin.com', '.creator.douyin.com', 'creator.douyin.com']")
    expect(douyinPublisher).toContain('async hasLoggedInPageSignal')
    expect(douyinPublisher).toContain('const workspaceCue = /发布作品|内容管理|作品管理|数据中心|互动管理|创作灵感|经营工具|工作台|创作者服务/.test(body)')
    expect(douyinPublisher).toContain('发布作品|内容管理|作品管理|数据中心|互动管理|创作灵感|经营工具|工作台|创作者服务')
    expect(scraperBase).toContain('finish(\'unknown\')')
    expect(scraperBase).toContain('this.cookieDomains || this.cookieDomain')
    expect(douyinScraper).toContain("cookieDomains = ['.douyin.com', 'douyin.com', '.creator.douyin.com', 'creator.douyin.com']")
  })

  it('keeps long copywriting and video generation requests alive across page switches', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('GENERATION_KEEPALIVE_ROUTES')
      expect(theme).toContain('GENERATION_SESSION_ID')
      expect(theme).toContain('/\\/copywriting\\/(?:generate-stream|text-rewrite-stream)')
      expect(theme).toContain('/\\/video\\/ad\\/generate-stream')
      expect(theme).toContain('/\\/one-click\\/(?:generate-stream|analyze-v2-stream|search-for-scene)')
      expect(theme).toContain('function installGenerationRequestKeepalive()')
      expect(theme).toContain('yx.background-generation.active')
      expect(theme).toContain('markGenerationRequestStarted')
      expect(theme).toContain('sessionId: GENERATION_SESSION_ID')
      expect(theme).toContain('updateActiveGenerationRequest')
      expect(theme).toContain('monitorGenerationResponse')
      expect(theme).toContain('event.type === \'progress\'')
      expect(theme).toContain('event.type === \'chunk\'')
      expect(theme).toContain('yx-inline-generation-status')
      expect(theme).toContain('mountBackgroundGenerationStatus')
      expect(theme).toContain('后台生成中')
      expect(theme).toContain('function findGenerationPanel()')
      expect(theme).toContain('/^AI\\s*实时生成$/')
      expect(theme).toContain('panel.appendChild(box)')
      expect(theme).toContain('/点左侧.*开始生成|AI 会依次/')
      expect(theme).toContain("const panel = document.getElementById('yx-background-generation-status')")
      expect(theme).toContain('panel?.remove()')
      expect(theme).not.toContain("panel.id = 'yx-background-generation-status'")
      expect(theme).not.toContain('document.body.appendChild(panel)')
      expect(theme).not.toContain('panel.prepend(box)')
      expect(theme).not.toContain('切换页面不会停止任务；当前进度由后台连接同步。')
      expect(theme).toContain('window.fetch = function yxGenerationFetch')
      expect(theme).toContain('XMLHttpRequest')
      expect(theme).toContain('signal: undefined')
      expect(theme).toContain('function markGenerationCancelIntent')
      expect(theme).toContain('停止|取消|终止|关闭生成|放弃生成')
    }
  })

  it('keeps generation async without blocking tab navigation with confirmation dialogs', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('installGenerationRequestKeepalive()')
      expect(theme).toContain('function mountInlineGenerationStatus')
      expect(theme).toContain('signal: undefined')
      expect(theme).not.toContain('window.confirm')
      expect(theme).not.toContain('warnBeforeLeavingGeneration')
      expect(theme).not.toContain('installGenerationLeaveGuard')
      expect(theme).not.toContain('当前正在生成内容')
    }
  })

  it('restores completed generation text and suppresses navigation timeout noise', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('GENERATION_RESULT_KEY')
      expect(theme).toContain('GENERATION_PANEL_SNAPSHOT_KEY')
      expect(theme).toContain('persistGenerationResult')
      expect(theme).toContain('restoreGenerationResultToPanel')
      expect(theme).toContain('persistVisibleGenerationPanelContent')
      expect(theme).toContain('installGenerationPanelSnapshot')
      expect(theme).toContain('qs-stream-box')
      expect(theme).toContain('isBenignGenerationAbortError')
      expect(theme).toContain('TimeoutError: The operation was aborted due to timeout')
      expect(theme).toContain('HTTP 0')
      expect(theme).toContain('const benignAbort = !ok && isBenignGenerationAbortError(error)')
      expect(theme).toContain('event.preventDefault()')
      expect(theme).toContain('error && !benignAbort')
      expect(theme).toContain('const shouldRestore = (text)')
      expect(theme).toContain('等待流式输出|点左侧|开始生成')
      expect(theme).toContain('patchedGenerationConfirm')
    }
  })

  it('blocks stale Qianshan navigation in the operation shrimp renderer', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('function installQianshanNavigationGuard')
      expect(theme).toContain('qianshanai\\.cn|api\\.qianshanai\\.cn|www\\.qianshanai\\.cn')
      expect(theme).toContain('patchedWindowOpen')
      expect(theme).toContain('api.openExternal = (url, ...args)')
      expect(theme).toContain('installQianshanNavigationGuard()')
    }
  })

  it('shows account energy balance in the sidebar account card', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('function formatEnergyBalance')
      expect(theme).toContain('function readOfficialEnergyBalance')
      expect(theme).toContain('/api/llm/official-catalog')
      expect(theme).toContain('result.state.user = { ...result.state.user, energy_balance: officialBalance }')
      expect(theme).toContain('算力 ${formatEnergyBalance(user && user.energy_balance)}')
    }
  })

  it('adds inline official/local model selectors in the actual generation workbench', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('function mountInlineModelPickers')
      expect(theme).toContain('data-yx-model-picker="copywriting"')
      expect(theme).toContain('文案模型')
      expect(theme).toContain('官方文案模型（积分）')
      expect(theme).toContain('data-yx-model-picker="image"')
      expect(theme).toContain('图片模型')
      expect(theme).toContain('image-2（官方）')
      expect(theme).toContain('/api/llm/ai-source')
      expect(theme).toContain('/api/llm/local-image-source')
      expect(theme).toContain('syncTextModelChoice(originalFetch)')
      expect(theme).toContain('syncImageModelChoice(originalFetch)')
      expect(theme).toContain('mountInlineModelPickers()')
      expect(theme).not.toContain("position: 'fixed',\n      right: '24px',\n      top: '68px'")
    }
  })
})
