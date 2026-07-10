"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = exports.USE_MOCK = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// dev：同时加载 monorepo 根目录的 .env 和 packages/main/.env（后者覆盖前者）。
// prod：所有 API key/凭据走数据库（用户在 Settings 里配），不读 .env，
//       因为打包后路径解析到 Program Files\千山AI\resources\，那里没有 .env，
//       静默 dotenv 失败也无所谓但污染日志。
let isPackaged = false;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    isPackaged = !!(electron && electron.app && electron.app.isPackaged);
}
catch {
    isPackaged = false;
}
if (!isPackaged) {
    dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../../.env') });
    dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../.env'), override: true });
}
/**
 * 是否启用 Mock 模式
 *
 * 默认 0（真实环境）：
 *   - ffmpeg / ffprobe：包内置二进制，默认可用
 *   - TTS：走微软 Edge Read Aloud（网络即可，无本地依赖）
 *   - 图片搜索：优先用户在 Settings 里填的 key，没 key 时 image-search 内部会回落 Mock
 *   - LLM：用户在 Settings 里配，没配时 llm runtime 自动降级 Mock
 *
 * 用户主动 export USE_MOCK=1 时强制全 Mock（离线演示）。
 */
exports.USE_MOCK = (process.env.USE_MOCK ?? '0').toString() === '1';
exports.config = {
    // LLM 配置
    llm: {
        provider: process.env.LLM_PROVIDER || 'qwen',
        apiKey: process.env.LLM_API_KEY || '',
        model: process.env.LLM_MODEL || 'qwen-plus',
        fallbackProvider: process.env.LLM_FALLBACK_PROVIDER || '',
        fallbackApiKey: process.env.LLM_FALLBACK_API_KEY || '',
    },
    // Kling 视频 API
    kling: {
        accessKey: process.env.KLING_ACCESS_KEY || '',
        secretKey: process.env.KLING_SECRET_KEY || '',
    },
    // 一键成片：素材图片检索
    images: {
        pexelsKey: process.env.PEXELS_API_KEY || '',
        unsplashKey: process.env.UNSPLASH_ACCESS_KEY || '',
    },
    // 应用配置
    app: {
        isDev: process.env.NODE_ENV !== 'production',
        useMock: exports.USE_MOCK,
    },
};
//# sourceMappingURL=config.js.map