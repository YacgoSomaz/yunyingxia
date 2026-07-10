"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDataViz = generateDataViz;
/**
 * 数据场景可视化 —— 用 SVG + sharp 编程生成数据图表 PNG
 *
 * 解决问题：文案里出现"从4部到200部"、"17亿票房"、"成本从5万降到50元"等数据时，
 * AI 经常画错数字或画成一个"人在看电脑"。用编程生成 100% 准确、毫秒级速度。
 *
 * 4 种图表：
 *   - grid-highlight: 方块网格高亮（如"5000部中仅4部"）
 *   - growth-bar:     柱状增长图（如"4→200"）
 *   - cost-compare:   左右对比柱（如"5万 vs 50元"）
 *   - big-number:     超大数字居中（如"17亿"）
 */
const sharp_1 = __importDefault(require("sharp"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
const paths_1 = require("../utils/paths");
// ── 数据目录（dev → packages/main/data，prod → userData/data） ──
// 注意：dataDir() 只 mkdir 父目录，wrapper 必须显式 mkdir 叶子目录本身
function ensureDataDir(...sub) {
    const p = (0, paths_1.dataDir)(...sub);
    if (!fs.existsSync(p))
        fs.mkdirSync(p, { recursive: true });
    return p;
}
// ── 主入口 ────────────────────────────────────────────────────────────────────
/**
 * 根据配置生成数据可视化 PNG 图片
 * @returns 本地 PNG 文件路径
 */
async function generateDataViz(config, resolution) {
    const [w, h] = (resolution || '1080x1920').split('x').map(Number);
    const outDir = ensureDataDir('data-viz');
    const outPath = path.join(outDir, `dataviz-${config.vizType}-${Date.now()}.png`);
    let svg;
    switch (config.vizType) {
        case 'grid-highlight':
            svg = drawGridHighlight(w, h, config);
            break;
        case 'growth-bar':
            svg = drawGrowthChart(w, h, config);
            break;
        case 'cost-compare':
            svg = drawCostCompare(w, h, config);
            break;
        case 'big-number':
            svg = drawBigNumber(w, h, config);
            break;
        default:
            svg = drawBigNumber(w, h, config);
    }
    await (0, sharp_1.default)(Buffer.from(svg)).png().toFile(outPath);
    logger_1.logger.info(`[DataViz] ${config.vizType} → ${path.basename(outPath)} (${w}×${h})`);
    return outPath;
}
// ── SVG 公共工具 ──────────────────────────────────────────────────────────────
/** 深色渐变背景（蓝紫系） */
function bgGradient(id) {
    return `
    <defs>
      <linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0d0d2b;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#1a1a4e;stop-opacity:1" />
      </linearGradient>
    </defs>`;
}
/** XML 转义 */
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// ── 1. 方块网格高亮 ──────────────────────────────────────────────────────────
/**
 * drawGridHighlight — "5000部中仅4部" 类
 * 画 total 个小方块（上限 500，超出按比例缩放），highlight 个用金色
 */
function drawGridHighlight(w, h, config) {
    const total = Math.max(1, parseInt(config.numbers[0] || '100', 10) || 100);
    const highlight = Math.max(1, parseInt(config.numbers[1] || '4', 10) || 4);
    const title = config.label || `${total} 中仅 ${highlight}`;
    // 限制绘制方块数上限（防止 SVG 过大）
    const maxBlocks = 500;
    const scale = total > maxBlocks ? maxBlocks / total : 1;
    const drawTotal = Math.min(total, maxBlocks);
    const drawHighlight = Math.max(1, Math.round(highlight * scale));
    // 网格布局参数
    const gridTop = h * 0.22;
    const gridBottom = h * 0.85;
    const gridLeft = w * 0.08;
    const gridRight = w * 0.92;
    const gridW = gridRight - gridLeft;
    const gridH = gridBottom - gridTop;
    // 计算每行多少个方块
    const cols = Math.ceil(Math.sqrt(drawTotal * (gridW / gridH)));
    const rows = Math.ceil(drawTotal / cols);
    const cellW = gridW / cols;
    const cellH = gridH / rows;
    const blockSize = Math.min(cellW, cellH) * 0.8;
    const gap = Math.min(cellW, cellH) * 0.1;
    // 随机选 highlight 个位置
    const highlightSet = new Set();
    while (highlightSet.size < drawHighlight && highlightSet.size < drawTotal) {
        highlightSet.add(Math.floor(Math.random() * drawTotal));
    }
    let blocks = '';
    for (let i = 0; i < drawTotal; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridLeft + col * cellW + gap;
        const y = gridTop + row * cellH + gap;
        const fill = highlightSet.has(i) ? '#FFD700' : '#2a2a5a';
        const stroke = highlightSet.has(i) ? '#FFA500' : '#3a3a6a';
        blocks += `<rect x="${x}" y="${y}" width="${blockSize}" height="${blockSize}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="0.5"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${bgGradient('bg1')}
  <rect width="${w}" height="${h}" fill="url(#bg1)"/>
  <text x="${w / 2}" y="${h * 0.1}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.045}" fill="#ffffff" font-weight="bold">${esc(title)}</text>
  ${config.subtitle ? `<text x="${w / 2}" y="${h * 0.15}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.03}" fill="#aaaacc">${esc(config.subtitle)}</text>` : ''}
  ${blocks}
  <text x="${w / 2}" y="${h * 0.93}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.035}" fill="#FFD700" font-weight="bold">■ ${highlight} / ${total}</text>
</svg>`;
}
// ── 2. 柱状增长图 ────────────────────────────────────────────────────────────
/**
 * drawGrowthChart — "4→200" 类增长
 * 左矮柱 + 右高柱 + 增长箭头 + 数字标签
 */
function drawGrowthChart(w, h, config) {
    const fromStr = config.numbers[0] || '0';
    const toStr = config.numbers[1] || '100';
    const fromVal = parseFloat(fromStr.replace(/[^\d.]/g, '')) || 1;
    const toVal = parseFloat(toStr.replace(/[^\d.]/g, '')) || 100;
    const title = config.label || `${fromStr} → ${toStr}`;
    const leftLabel = config.labels?.[0] || '之前';
    const rightLabel = config.labels?.[1] || '现在';
    const chartTop = h * 0.28;
    const chartBottom = h * 0.78;
    const chartH = chartBottom - chartTop;
    const maxVal = Math.max(fromVal, toVal);
    const barWidth = w * 0.22;
    const leftX = w * 0.22;
    const rightX = w * 0.56;
    const leftBarH = (fromVal / maxVal) * chartH;
    const rightBarH = (toVal / maxVal) * chartH;
    // 增长倍数
    const multiplier = toVal / fromVal;
    const growthText = multiplier >= 2
        ? `${multiplier.toFixed(0)}×`
        : `+${((multiplier - 1) * 100).toFixed(0)}%`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${bgGradient('bg2')}
  <rect width="${w}" height="${h}" fill="url(#bg2)"/>
  <text x="${w / 2}" y="${h * 0.1}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.05}" fill="#ffffff" font-weight="bold">${esc(title)}</text>
  ${config.subtitle ? `<text x="${w / 2}" y="${h * 0.16}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.03}" fill="#aaaacc">${esc(config.subtitle)}</text>` : ''}

  <!-- 左柱（矮） -->
  <rect x="${leftX}" y="${chartBottom - leftBarH}" width="${barWidth}" height="${leftBarH}" rx="8" fill="#4a6cf7" opacity="0.8"/>
  <text x="${leftX + barWidth / 2}" y="${chartBottom - leftBarH - h * 0.02}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.055}" fill="#4a6cf7" font-weight="bold">${esc(fromStr)}</text>
  <text x="${leftX + barWidth / 2}" y="${chartBottom + h * 0.05}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.032}" fill="#8888bb">${esc(leftLabel)}</text>

  <!-- 右柱（高） -->
  <rect x="${rightX}" y="${chartBottom - rightBarH}" width="${barWidth}" height="${rightBarH}" rx="8" fill="#00d4aa" opacity="0.9"/>
  <text x="${rightX + barWidth / 2}" y="${chartBottom - rightBarH - h * 0.02}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.055}" fill="#00d4aa" font-weight="bold">${esc(toStr)}</text>
  <text x="${rightX + barWidth / 2}" y="${chartBottom + h * 0.05}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.032}" fill="#8888bb">${esc(rightLabel)}</text>

  <!-- 增长箭头 -->
  <line x1="${leftX + barWidth + w * 0.03}" y1="${chartBottom - leftBarH * 0.5}" x2="${rightX - w * 0.03}" y2="${chartBottom - rightBarH * 0.5}" stroke="#FFD700" stroke-width="3" stroke-dasharray="8,4"/>
  <polygon points="${rightX - w * 0.03},${chartBottom - rightBarH * 0.5 - 8} ${rightX - w * 0.03 + 12},${chartBottom - rightBarH * 0.5} ${rightX - w * 0.03},${chartBottom - rightBarH * 0.5 + 8}" fill="#FFD700"/>

  <!-- 增长倍数标签 -->
  <text x="${w / 2}" y="${h * 0.9}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.07}" fill="#FFD700" font-weight="bold">${esc(growthText)}</text>
</svg>`;
}
// ── 3. 成本对比图 ────────────────────────────────────────────────────────────
/**
 * drawCostCompare — "5万 vs 50元" 类对比
 * 左红（旧/贵）右绿（新/便宜），高度按数值比例
 */
function drawCostCompare(w, h, config) {
    const beforeStr = config.numbers[0] || '50000';
    const afterStr = config.numbers[1] || '50';
    const beforeVal = parseFloat(beforeStr.replace(/[^\d.]/g, '')) || 1;
    const afterVal = parseFloat(afterStr.replace(/[^\d.]/g, '')) || 1;
    const title = config.label || `${beforeStr} vs ${afterStr}`;
    const leftLabel = config.labels?.[0] || '传统方式';
    const rightLabel = config.labels?.[1] || 'AI 方式';
    const chartTop = h * 0.28;
    const chartBottom = h * 0.75;
    const chartH = chartBottom - chartTop;
    const maxVal = Math.max(beforeVal, afterVal);
    const barWidth = w * 0.25;
    const leftX = w * 0.15;
    const rightX = w * 0.58;
    const leftBarH = (beforeVal / maxVal) * chartH;
    const rightBarH = Math.max(chartH * 0.05, (afterVal / maxVal) * chartH); // 最小高度 5%
    // 节省百分比
    const savings = ((1 - afterVal / beforeVal) * 100).toFixed(0);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${bgGradient('bg3')}
  <rect width="${w}" height="${h}" fill="url(#bg3)"/>
  <text x="${w / 2}" y="${h * 0.1}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.045}" fill="#ffffff" font-weight="bold">${esc(title)}</text>
  ${config.subtitle ? `<text x="${w / 2}" y="${h * 0.155}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.028}" fill="#aaaacc">${esc(config.subtitle)}</text>` : ''}

  <!-- 左柱（贵/红） -->
  <rect x="${leftX}" y="${chartBottom - leftBarH}" width="${barWidth}" height="${leftBarH}" rx="8" fill="#e74c3c" opacity="0.85"/>
  <text x="${leftX + barWidth / 2}" y="${chartBottom - leftBarH - h * 0.02}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.05}" fill="#e74c3c" font-weight="bold">${esc(beforeStr)}</text>
  <text x="${leftX + barWidth / 2}" y="${chartBottom + h * 0.045}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.03}" fill="#cc8888">${esc(leftLabel)}</text>

  <!-- 右柱（便宜/绿） -->
  <rect x="${rightX}" y="${chartBottom - rightBarH}" width="${barWidth}" height="${rightBarH}" rx="8" fill="#2ecc71" opacity="0.9"/>
  <text x="${rightX + barWidth / 2}" y="${chartBottom - rightBarH - h * 0.02}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.05}" fill="#2ecc71" font-weight="bold">${esc(afterStr)}</text>
  <text x="${rightX + barWidth / 2}" y="${chartBottom + h * 0.045}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.03}" fill="#88cc88">${esc(rightLabel)}</text>

  <!-- VS 标记 -->
  <text x="${w / 2}" y="${chartBottom - chartH * 0.3}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.06}" fill="#ffffff" opacity="0.3" font-weight="bold">VS</text>

  <!-- 节省标签 -->
  <rect x="${w * 0.25}" y="${h * 0.82}" width="${w * 0.5}" height="${h * 0.07}" rx="20" fill="#2ecc71" opacity="0.15"/>
  <text x="${w / 2}" y="${h * 0.87}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.045}" fill="#2ecc71" font-weight="bold">节省 ${savings}%</text>
</svg>`;
}
// ── 4. 超大数字 ──────────────────────────────────────────────────────────────
/**
 * drawBigNumber — "17亿" 类单个大数字
 * 超大数字居中 + 装饰光晕圆圈
 */
function drawBigNumber(w, h, config) {
    const mainNumber = config.numbers[0] || '0';
    const title = config.label || '';
    const subtitle = config.subtitle || '';
    // 装饰：几个半透明光晕圆圈
    const circles = [
        { cx: w * 0.2, cy: h * 0.35, r: w * 0.15, opacity: 0.05 },
        { cx: w * 0.8, cy: h * 0.6, r: w * 0.2, opacity: 0.04 },
        { cx: w * 0.5, cy: h * 0.45, r: w * 0.35, opacity: 0.03 },
        { cx: w * 0.3, cy: h * 0.7, r: w * 0.12, opacity: 0.06 },
    ];
    const circlesSvg = circles.map((c) => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="#FFD700" opacity="${c.opacity}"/>`).join('\n  ');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  ${bgGradient('bg4')}
  <rect width="${w}" height="${h}" fill="url(#bg4)"/>
  ${circlesSvg}

  ${title ? `<text x="${w / 2}" y="${h * 0.28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.04}" fill="#aaaacc" font-weight="normal">${esc(title)}</text>` : ''}

  <!-- 超大数字 -->
  <text x="${w / 2}" y="${h * 0.52}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.18}" fill="#FFD700" font-weight="bold">${esc(mainNumber)}</text>

  ${subtitle ? `<text x="${w / 2}" y="${h * 0.65}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${w * 0.035}" fill="#8888bb">${esc(subtitle)}</text>` : ''}
</svg>`;
}
//# sourceMappingURL=data-viz.js.map