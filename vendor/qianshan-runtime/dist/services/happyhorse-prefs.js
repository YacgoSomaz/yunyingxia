"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.happyHorsePrefs = void 0;
/**
 * 视频生成偏好(只剩分辨率档位)
 *
 * 完全云端化后,key 在 user_llm_config / 启用与否由"是否在网页配过"决定,
 * 老的 ttsEnabled / videoEnabled 开关已废弃。这里只保留 videoResolution
 * 因为它是用户产品偏好(720P/1080P 选哪个),跟 key 无关。
 *
 * 存储: data/happyhorse-prefs.json (人读的轻量 JSON,零迁移)
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
const DEFAULTS = {
    videoResolution: '720P',
};
function file() {
    return path_1.default.join((0, paths_1.dataDir)(), 'happyhorse-prefs.json');
}
let cache = null;
function load() {
    if (cache)
        return cache;
    try {
        const raw = fs_1.default.readFileSync(file(), 'utf-8');
        const parsed = JSON.parse(raw);
        const reso = parsed?.videoResolution;
        cache = {
            videoResolution: reso === '1080P' || reso === '720P' ? reso : DEFAULTS.videoResolution,
        };
    }
    catch {
        cache = { ...DEFAULTS };
    }
    return cache;
}
function persist(prefs) {
    try {
        fs_1.default.writeFileSync(file(), JSON.stringify(prefs, null, 2), 'utf-8');
    }
    catch (err) {
        logger_1.logger.warn(`[HappyHorsePrefs] persist failed: ${String(err)}`);
    }
}
exports.happyHorsePrefs = {
    get() {
        return { ...load() };
    },
    set(partial) {
        const next = { ...load(), ...partial };
        cache = next;
        persist(next);
        logger_1.logger.info(`[HappyHorsePrefs] reso=${next.videoResolution}`);
        return { ...next };
    },
};
//# sourceMappingURL=happyhorse-prefs.js.map