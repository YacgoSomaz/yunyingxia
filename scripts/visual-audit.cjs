const { _electron: electron } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'artifacts', 'visual-audit');
fs.mkdirSync(outDir, { recursive: true });

const navItems = ['首页', '选题雷达', '文案工坊', '视频工坊', '分发中心', '数据看板', '设置'];
const requestedItems = (process.env.VISUAL_AUDIT_ITEMS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const requestedTheme = process.env.VISUAL_AUDIT_THEME === 'dark' ? 'dark' : 'light';
const activeNavItems = requestedItems.length > 0
  ? navItems.filter((item) => item === '首页' || requestedItems.includes(item))
  : navItems;

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function analyzePage(page, name) {
  await page.waitForTimeout(900);
  const screenshotPath = path.join(outDir, `${sanitize(name)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const metrics = await page.evaluate(() => {
    function parseRgb(value) {
      const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?/);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    }

    function luminance({ r, g, b }) {
      const normalize = (channel) => {
        const s = channel / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
    }

    function contrast(a, b) {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function effectiveBackground(el) {
      let node = el;
      while (node && node.nodeType === Node.ELEMENT_NODE) {
        const color = parseRgb(getComputedStyle(node).backgroundColor);
        if (color && color.a > 0.85) return color;
        node = node.parentElement;
      }
      return { r: 247, g: 248, b: 250, a: 1 };
    }

    function elementLabel(el) {
      const parts = [el.tagName.toLowerCase()];
      if (el.id) parts.push(`#${el.id}`);
      const cls = String(el.className || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3)
        .map((item) => `.${item}`)
        .join('');
      if (cls) parts.push(cls);
      return parts.join('');
    }

    const body = document.body;
    const text = (body.innerText || '').trim();
    const all = Array.from(document.querySelectorAll('body *'));
    const visible = all.filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== 'hidden'
        && style.display !== 'none'
        && rect.width > 1
        && rect.height > 1;
    });
    const darkNodes = visible.filter((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return false;
      const [r, g, b] = match.slice(1).map(Number);
      return r < 40 && g < 45 && b < 60;
    });
    const whiteTextNodes = visible.filter((el) => {
      const color = getComputedStyle(el).color;
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return false;
      const [r, g, b] = match.slice(1).map(Number);
      return r > 220 && g > 220 && b > 220;
    });
    const zeroTextPanels = visible.filter((el) => {
      const rect = el.getBoundingClientRect();
      const cls = String(el.className || '');
      return rect.width > 260 && rect.height > 160 && /card|panel|content|page|layout/i.test(cls) && !(el.innerText || '').trim();
    });
    const lowContrastWhiteText = visible
      .map((el) => {
        const ownText = Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.nodeValue || '')
          .join('')
          .trim();
        if (!ownText) return null;
        const fg = parseRgb(getComputedStyle(el).color);
        if (!fg || fg.r < 210 || fg.g < 210 || fg.b < 210) return null;
        const bg = effectiveBackground(el);
        const ratio = contrast(fg, bg);
        if (ratio >= 3) return null;
        const rect = el.getBoundingClientRect();
        return {
          selector: elementLabel(el),
          text: ownText.slice(0, 60),
          color: getComputedStyle(el).color,
          background: `rgb(${bg.r}, ${bg.g}, ${bg.b})`,
          contrast: Number(ratio.toFixed(2)),
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      })
      .filter(Boolean)
      .slice(0, 20);
    return {
      title: document.title,
      textLength: text.length,
      visibleCount: visible.length,
      darkNodeCount: darkNodes.length,
      whiteTextNodeCount: whiteTextNodes.length,
      zeroTextPanelCount: zeroTextPanels.length,
      lowContrastWhiteText,
      bodySnippet: text.slice(0, 180),
      location: location.href,
    };
  });

  return { name, screenshotPath, metrics };
}

(async () => {
  const app = await electron.launch({
    executablePath: path.join(root, '.runtime-electron', 'node_modules', 'electron', 'dist', 'electron.exe'),
    args: [root],
    env: {
      ...process.env,
      WANSHAN_USE_MOCK: '0',
    },
  });

  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((theme) => {
    localStorage.setItem('operating-shrimp-theme-mode', theme);
  }, requestedTheme);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const results = [];
  results.push(await analyzePage(page, '00-首页'));

  for (const item of activeNavItems.slice(1)) {
    const nav = page.getByText(item, { exact: true }).first();
    try {
      await nav.waitFor({ state: 'visible', timeout: 5000 });
      await nav.click();
      results.push(await analyzePage(page, item));
    } catch (error) {
      results.push({
        name: item,
        screenshotPath: null,
        metrics: { error: error.message },
      });
    }
  }

  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify({ reportPath, results }, null, 2));

  try {
    const child = app.process();
    if (child && !child.killed) child.kill();
  } catch (_) {
    await app.close().catch(() => {});
  }
  process.exit(0);
})();
