"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlatformSelectors = getPlatformSelectors;
exports.buildReadyCheck = buildReadyCheck;
exports.buildItemsSpread = buildItemsSpread;
exports.buildTitleQuery = buildTitleQuery;
exports.buildCategoryRegex = buildCategoryRegex;
exports.getXhrKeywords = getXhrKeywords;
/**
 * 选择器配置加载器
 *
 * 从 selectors.json 读取各平台的 CSS 选择器，生成可注入 evaluate() 的 JS 片段。
 * 页面改版只需编辑 selectors.json，无需动 TS 源码。
 */
const selectors_json_1 = __importDefault(require("./selectors.json"));
const sels = selectors_json_1.default;
function getPlatformSelectors(platform) {
    return sels[platform];
}
/**
 * 生成"等待页面就绪"IIFE 字符串。
 * ready 数组中任一选择器命中即返回 true。
 */
function buildReadyCheck(platform) {
    const cfg = sels[platform];
    const checks = cfg.ready
        .map((s) => `document.querySelectorAll(${JSON.stringify(s)}).length > 0`)
        .join(' ||\n      ');
    return `(() => { return ${checks}; })()`;
}
/**
 * 生成候选元素的展开语法（嵌入 extractScript 的数组字面量内）。
 * 输出示例：
 *   ...document.querySelectorAll("[class*='InspirationItem']"),
 *   ...document.querySelectorAll("[class*='HotTopic']")
 */
function buildItemsSpread(platform) {
    const cfg = sels[platform];
    return cfg.items
        .map((s) => `          ...document.querySelectorAll(${JSON.stringify(s)})`)
        .join(',\n');
}
/**
 * 生成"从子元素取标题"的 JS 逻辑片段（querySelector fallback 链）。
 * 输出示例：
 *   el.querySelector("[class*='title']") || el.querySelector("h3") || el
 */
function buildTitleQuery(platform) {
    const cfg = sels[platform];
    return cfg.title
        .map((s) => `el.querySelector(${JSON.stringify(s)})`)
        .join(' || ') + ' || el';
}
/**
 * 将 categories 数组序列化为用于正则 match 的 JS 字符串字面量。
 * 输出：`/(美食|科技|时尚|...)/`
 */
function buildCategoryRegex(platform) {
    const cfg = sels[platform];
    return `/(${cfg.categories.join('|')})/`;
}
/** XHR URL 关键词（用于 Weixin XHR 拦截过滤） */
function getXhrKeywords(platform) {
    return sels[platform]?.xhrUrlKeywords ?? [];
}
//# sourceMappingURL=selectors.js.map