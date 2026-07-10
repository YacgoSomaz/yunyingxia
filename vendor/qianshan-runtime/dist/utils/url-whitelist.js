"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUrlAllowed = isUrlAllowed;
/**
 * shell.openExternal URL 白名单：
 * 只放行 http(s) / mailto，且限制到已知安全域，避免被恶意 DOM / LLM 输出注入 file:// 或 javascript: 协议。
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const ALLOWED_HOST_SUFFIXES = [
    // 平台官方
    'douyin.com',
    'xiaohongshu.com',
    'bilibili.com',
    'weibo.com',
    'weixin.qq.com',
    'qq.com',
    'kuaishou.com',
    // AI 服务
    'aliyuncs.com',
    'dashscope.aliyuncs.com',
    'aliyun.com', // 百炼控制台 bailian.console.aliyun.com（注册/获取 Key）
    'deepseek.com',
    'klingai.com',
    'ollama.com',
    'ollama.ai',
    'anthropic.com',
    'openai.com',
    'siliconflow.cn',
    'lingyaai.cn', // 灵芽 AI 网关
    'qianshanai.cn', // 千山 AI 平台（用户在网页端管理 LLM 配置）
    // 图片素材
    'pexels.com',
    'unsplash.com',
    // 通用工具
    'github.com',
    'npmjs.com',
    // 公共网盘/文档
    'baidu.com',
    'feishu.cn',
    'yuque.com',
];
function isUrlAllowed(raw) {
    try {
        const url = new URL(raw);
        if (!ALLOWED_PROTOCOLS.has(url.protocol))
            return false;
        // mailto: 不校验 host
        if (url.protocol === 'mailto:')
            return true;
        const host = url.hostname.toLowerCase();
        return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith('.' + suffix));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=url-whitelist.js.map