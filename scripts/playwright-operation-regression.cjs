const { chromium } = require('@playwright/test');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const themePath = path.join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.route('http://127.0.0.1:19832/__operation_regression.html', async (route) => {
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>运营虾回归断言</title></head>
      <body>
        <aside class="ant-layout-sider"><div>运营虾</div></aside>
        <main>
          <section id="gen-panel">
            <h2>AI 实时生成</h2>
            <div class="qs-stream-box">点左侧「开始生成」，AI 会依次写大纲。</div>
          </section>
          <a id="old-link" href="https://qianshanai.cn/user/llm-configs">qianshanai.cn 网页端</a>
        </main>
      </body>
    </html>
  `,
    });
  });
  await page.goto('http://127.0.0.1:19832/__operation_regression.html');

  await page.evaluate(() => {
    window.__openExternalCalls = [];
    window.electronAPI = {
      openExternal(url) {
        window.__openExternalCalls.push(url);
        return Promise.resolve(true);
      },
      account: {
        me: async () => ({ ok: false }),
      },
    };
    localStorage.setItem('yx.background-generation.panel-snapshot', JSON.stringify({
      kind: '文案',
      ok: true,
      content: '这是 Playwright 恢复断言内容，不能被默认占位覆盖。',
      savedAt: Date.now(),
    }));
    history.pushState({}, '', '/copywriting');
  });

  await page.addScriptTag({ path: themePath });
  await page.waitForTimeout(1300);

  const streamText = await page.locator('.qs-stream-box').innerText();
  if (!streamText.includes('Playwright 恢复断言内容')) {
    throw new Error(`生成框没有恢复快照，实际内容：${streamText}`);
  }

  const staleLinkCount = await page.locator('#old-link').count();
  if (staleLinkCount !== 0) {
    throw new Error('千山旧链接仍作为可点击 a[href] 存在');
  }
  await page.evaluate(() => window.open('https://qianshanai.cn/user/llm-configs'));
  await page.waitForTimeout(100);
  const opened = await page.evaluate(() => window.__openExternalCalls.slice());
  if (opened.length > 0) {
    throw new Error(`千山旧链接仍会外跳：${opened.join(', ')}`);
  }

  await page.screenshot({ path: path.join(root, 'artifacts', 'operation-regression-playwright.png'), fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ ok: true, streamText, opened, screenshot: 'artifacts/operation-regression-playwright.png' }, null, 2));
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
