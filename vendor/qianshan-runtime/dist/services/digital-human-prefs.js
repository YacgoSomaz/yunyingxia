"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.digitalHumanPrefs = void 0;
/**
 * 数字人生成器偏好(本地配置,不进云端 user_llm_config)
 *
 * 现状:
 *   - 阿里万相 wan2.2-s2v(已支持) — 复用云端 voice 类百炼 sk-xxx,不需要本地配
 *   - 百度曦灵照片数字人(本次新增) — 用户自己的 AppID/AppKey,必须本地配
 *
 * 为什么不进 user_llm_config:
 *   - 曦灵不是 LLM/image/video 模型,跟"模型档位"没关系
 *   - AppKey 是用户在百度智能云控制台自己开的,跟千山的云端配额无关
 *   - 切供应商是产品偏好(用阿里还是用百度),不是 model 切换
 *
 * 存储: data/digital-human-prefs.json(JSON 文件,人能直接看/改)
 * AppKey: 用 cryptoStorage(safeStorage / DPAPI / Keychain)加密落盘,**不打日志**
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
const crypto_storage_1 = require("../utils/crypto-storage");
const DEFAULTS = {
    provider: 'aliyun_wan_s2v',
    xiling: {
        appId: '',
        model: 'turbo_v2',
        baseUrl: 'https://open.xiling.baidu.com',
        uploadMode: 'qianshan_temp_upload',
        tempUploadUrl: '',
    },
};
function file() {
    return path_1.default.join((0, paths_1.dataDir)(), 'digital-human-prefs.json');
}
let cache = null;
function isValidProvider(v) {
    return v === 'aliyun_wan_s2v' || v === 'baidu_xiling_photo';
}
function isValidModel(v) {
    return v === 'turbo_v2' || v === 'quality_v2';
}
function isValidUploadMode(v) {
    // 官方 file/upload 只保留在代码里做诊断,正常产品配置统一走工具内的临时公网素材上传。
    return v === 'qianshan_temp_upload' || v === 'custom_public_asset';
}
function normalizeXilingBaseUrl(v) {
    const raw = typeof v === 'string' && v.trim() ? v.trim().replace(/\/+$/, '') : DEFAULTS.xiling.baseUrl;
    // 旧版本曾默认写成文档站域名,实际 OpenAPI 域名是 open.xiling.baidu.com。
    if (/^https:\/\/xiling\.cloud\.baidu\.com$/i.test(raw))
        return DEFAULTS.xiling.baseUrl;
    return raw;
}
function load() {
    if (cache)
        return cache;
    try {
        const raw = fs_1.default.readFileSync(file(), 'utf-8');
        const parsed = JSON.parse(raw);
        const x = parsed?.xiling || {};
        cache = {
            provider: isValidProvider(parsed?.provider) ? parsed.provider : DEFAULTS.provider,
            xiling: {
                appId: typeof x.appId === 'string' ? x.appId : DEFAULTS.xiling.appId,
                appKeyEncrypted: typeof x.appKeyEncrypted === 'string' ? x.appKeyEncrypted : undefined,
                model: isValidModel(x.model) ? x.model : DEFAULTS.xiling.model,
                baseUrl: normalizeXilingBaseUrl(x.baseUrl),
                uploadMode: isValidUploadMode(x.uploadMode) ? x.uploadMode : DEFAULTS.xiling.uploadMode,
                tempUploadUrl: typeof x.tempUploadUrl === 'string' ? x.tempUploadUrl : DEFAULTS.xiling.tempUploadUrl,
                tempUploadTokenEncrypted: typeof x.tempUploadTokenEncrypted === 'string' ? x.tempUploadTokenEncrypted : undefined,
            },
        };
    }
    catch {
        cache = { provider: DEFAULTS.provider, xiling: { ...DEFAULTS.xiling } };
    }
    return cache;
}
function persist(prefs) {
    try {
        fs_1.default.writeFileSync(file(), JSON.stringify(prefs, null, 2), 'utf-8');
    }
    catch (err) {
        logger_1.logger.warn(`[DigitalHumanPrefs] persist failed: ${String(err)}`);
    }
}
exports.digitalHumanPrefs = {
    /** 给路由 / 前端的安全视图 */
    getPublic() {
        const p = load();
        return {
            provider: p.provider,
            xiling: {
                appId: p.xiling.appId,
                appKey: p.xiling.appKeyEncrypted ? crypto_storage_1.cryptoStorage.decrypt(p.xiling.appKeyEncrypted) : '',
                appKeyConfigured: !!p.xiling.appKeyEncrypted,
                model: p.xiling.model,
                baseUrl: p.xiling.baseUrl,
                uploadMode: p.xiling.uploadMode,
                tempUploadUrl: p.xiling.tempUploadUrl || '',
                tempUploadTokenConfigured: !!p.xiling.tempUploadTokenEncrypted,
            },
        };
    },
    /** 主进程内部用 — 解密 AppKey;曦灵未配 AppKey 时返回 null */
    getResolved() {
        const p = load();
        let xiling = null;
        if (p.xiling.appId && p.xiling.appKeyEncrypted) {
            const appKey = crypto_storage_1.cryptoStorage.decrypt(p.xiling.appKeyEncrypted);
            if (appKey) {
                xiling = {
                    appId: p.xiling.appId,
                    appKey,
                    model: p.xiling.model,
                    baseUrl: p.xiling.baseUrl,
                    uploadMode: p.xiling.uploadMode,
                    tempUploadUrl: p.xiling.tempUploadUrl || '',
                    tempUploadToken: p.xiling.tempUploadTokenEncrypted
                        ? crypto_storage_1.cryptoStorage.decrypt(p.xiling.tempUploadTokenEncrypted)
                        : undefined,
                };
            }
        }
        return { provider: p.provider, xiling };
    },
    /** 局部更新;appKey 空就不动旧的;返回更新后的 public 视图 */
    set(update) {
        const prev = load();
        const nextXiling = { ...prev.xiling };
        if (update.xiling) {
            if (typeof update.xiling.appId === 'string')
                nextXiling.appId = update.xiling.appId.trim();
            if (typeof update.xiling.appKey === 'string' && update.xiling.appKey.trim()) {
                // 用户传了新 AppKey,加密落盘
                nextXiling.appKeyEncrypted = crypto_storage_1.cryptoStorage.encrypt(update.xiling.appKey.trim());
            }
            if (isValidModel(update.xiling.model))
                nextXiling.model = update.xiling.model;
            if (typeof update.xiling.baseUrl === 'string' && update.xiling.baseUrl.trim()) {
                nextXiling.baseUrl = normalizeXilingBaseUrl(update.xiling.baseUrl);
            }
            if (isValidUploadMode(update.xiling.uploadMode)) {
                nextXiling.uploadMode = update.xiling.uploadMode;
            }
            if (typeof update.xiling.tempUploadUrl === 'string') {
                nextXiling.tempUploadUrl = update.xiling.tempUploadUrl.trim();
            }
            if (typeof update.xiling.tempUploadToken === 'string' &&
                update.xiling.tempUploadToken.trim()) {
                nextXiling.tempUploadTokenEncrypted = crypto_storage_1.cryptoStorage.encrypt(update.xiling.tempUploadToken.trim());
            }
        }
        const next = {
            provider: isValidProvider(update.provider) ? update.provider : prev.provider,
            xiling: nextXiling,
        };
        cache = next;
        persist(next);
        logger_1.logger.info(`[DigitalHumanPrefs] provider=${next.provider} ` +
            `xiling.model=${next.xiling.model} ` +
            `xiling.uploadMode=${next.xiling.uploadMode} ` +
            `xiling.tempUploadConfigured=${!!next.xiling.tempUploadUrl} ` +
            `xiling.appKeyConfigured=${!!next.xiling.appKeyEncrypted}`);
        return this.getPublic();
    },
};
//# sourceMappingURL=digital-human-prefs.js.map