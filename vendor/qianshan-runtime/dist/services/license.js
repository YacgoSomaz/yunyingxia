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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedPhone = getCachedPhone;
exports.getDeviceId = getDeviceId;
exports.getMemberInfo = getMemberInfo;
exports.msgForCode = msgForCode;
exports.stopHeartbeat = stopHeartbeat;
exports.login = login;
exports.logout = logout;
/**
 * 授权服务 —— 接入 qianshanai.cn /tools/verify(单点登录版)
 *
 * 单点登录:同账号同工具任意时刻只允许 1 台机器在线,新设备登录顶旧设备。
 * 协议依据:docs/desktop-tool-verify-api.md + docs/media-tool-integration.md
 *
 * 流程:
 *   1) 启动时:UI 展示登录页,用户输入手机号 → 调 login(phone)
 *      - 调 verify 时带 loginIntent=true → 服务端把绑定改成本机(顶号)
 *      - 200 → 缓存手机号 + 启动 5 分钟心跳
 *      - 4001/4002/4007/4008/4010 → UI 展示服务端 message,留在登录页
 *      - 启动调用永远拿不到 4009(loginIntent=true 时新设备永远赢)
 *   2) 主界面运行期:每 5 分钟自动 verify 一次,带 loginIntent=false
 *      - 4007/4008/4009/4010 → 弹窗 + app.quit()
 *      - 4001/4002 → 静默忽略(4002 是管理员后台解绑标记,不打扰运行中用户;
 *                    服务端不消费该标记,等下次启动 verify 才让用户回登录页)
 *      - 网络错/5xx → 忽略本次,等下个周期(不立刻重试,不指数退避)
 *   3) deviceId v2:由 hostname / cpuModel / cpuCount 通过 SHA-256 派生,
 *      进程内缓存,不持久化。跨重启 / VPN 切换 / 虚拟网卡变化稳定不变。
 */
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const crypto_1 = require("crypto");
const electron_1 = require("electron");
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
const TOOL_CODE = 'video';
const VERIFY_URL = 'https://api.qianshanai.cn/api/tools/verify';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000;
function authFile() {
    return (0, paths_1.dataDir)('auth.json');
}
function loadCache() {
    try {
        const p = authFile();
        if (fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    }
    catch (e) {
        logger_1.logger.warn('[License] loadCache fail: ' + String(e));
    }
    return {};
}
function saveCache(c) {
    try {
        fs.writeFileSync(authFile(), JSON.stringify(c, null, 2), 'utf8');
    }
    catch (e) {
        logger_1.logger.warn('[License] saveCache fail: ' + String(e));
    }
}
function getCachedPhone() {
    return loadCache().phone || null;
}
// v2 deviceId:进程内缓存 + 由稳定字段派生(hostname / cpuModel / cpuCount)
// 不持久化到文件;跨重启 / VPN 切换 / 虚拟网卡变化保持不变。
let _cachedDeviceId = null;
function getDeviceId() {
    if (_cachedDeviceId)
        return _cachedDeviceId;
    const hostname = os.hostname();
    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model ?? ''; // 末尾空格保留原样
    const cpuCount = cpus.length;
    const input = `v2|${hostname}|${cpuModel}|${cpuCount}`;
    _cachedDeviceId = (0, crypto_1.createHash)('sha256').update(input).digest('hex').toUpperCase();
    return _cachedDeviceId;
}
function deviceInfo() {
    return `${os.platform()}-${os.release()} / ${os.hostname()}`;
}
// 最近一次 verify 成功返回的会员信息(供 UI 显示卡名/到期 用)
let cachedMemberData = null;
function getMemberInfo() {
    return cachedMemberData;
}
/**
 * 业务码 → 文案
 *
 * 协议约定(media-tool-integration.md §5):服务端会下发权威 message,
 * 桌面端**透传不硬编码**。本函数只负责在服务端 message 缺失时给个兜底。
 *
 * 特别注意:
 *   4002 有两种语义共用同一码 ——
 *     a) 真未注册 → "手机号未注册,请先到 https://www.qianshanai.cn 注册"
 *     b) 管理员后台解绑后 → "账号已解绑,请重新登录"
 *   两种 message 都由服务端下发,绝不能写死成其中一种。
 */
function msgForCode(code, raw) {
    // 优先走服务端 message(只要非空就直接用)
    if (raw && raw.trim())
        return raw;
    // 兜底文案:仅当服务端没下发 message 时使用,文案对齐 media-tool-integration.md §5
    switch (code) {
        case 200:
            return '校验通过';
        case 4001:
            return '工具不存在或已下架';
        case 4002:
            return '手机号未注册或账号已解绑,请重新登录';
        case 4007:
            return '该手机号未授权该工具或账号已被禁用';
        case 4008:
            return '权益已过期,请到网站续费';
        case 4009:
            return '您的账号已在其他设备登录,本设备已下线';
        case 4010:
            return '工具已被管理员禁用';
        case -1:
            return '网络异常,请检查网络后重试';
        default:
            return `校验失败(code=${code})`;
    }
}
/**
 * @param phone        用户手机号
 * @param loginIntent  true=启动调用(让服务端顶号到本机),false=运行期心跳(被顶号会拿到 4009)
 */
async function verifyOnce(phone, loginIntent) {
    try {
        const resp = await fetch(VERIFY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone,
                toolCode: TOOL_CODE,
                deviceId: getDeviceId(),
                deviceInfo: deviceInfo(),
                loginIntent,
            }),
        });
        const text = await resp.text();
        let data = {};
        try {
            data = text ? JSON.parse(text) : {};
        }
        catch {
            data = { message: text };
        }
        // 后端约定 code 在 body 里;HTTP 200 是传输 OK,业务码看 body.code
        const code = Number(data?.code ?? resp.status);
        if (code === 200) {
            cachedMemberData = data?.data ?? data;
        }
        return {
            ok: code === 200,
            code,
            message: String(data?.message || data?.msg || ''),
            data: data?.data ?? data,
        };
    }
    catch (err) {
        logger_1.logger.warn('[License] verify network error: ' + String(err?.message || err));
        return { ok: false, code: -1, message: String(err?.message || err) };
    }
}
let heartbeatTimer = null;
function startHeartbeat(phone) {
    stopHeartbeat();
    heartbeatTimer = setInterval(async () => {
        // 心跳必须带 loginIntent=false,这样如果本机已被另一台设备顶号,服务端会回 4009
        const r = await verifyOnce(phone, false);
        if (r.ok) {
            logger_1.logger.info('[License] heartbeat ok');
            return;
        }
        if (r.code === 4007 || r.code === 4008 || r.code === 4010) {
            logger_1.logger.warn(`[License] heartbeat terminal code=${r.code}`);
            electron_1.dialog.showErrorBox('授权失效', msgForCode(r.code, r.message));
            electron_1.app.quit();
        }
        else if (r.code === 4009) {
            // 单点登录被新设备顶号 —— 必须退出
            logger_1.logger.warn('[License] heartbeat 4009: 被其他设备顶号,退出');
            electron_1.dialog.showErrorBox('账号已下线', msgForCode(4009, r.message));
            electron_1.app.quit();
        }
        else {
            logger_1.logger.warn(`[License] heartbeat 非终止错误 code=${r.code} msg=${r.message},等下一周期`);
        }
    }, HEARTBEAT_INTERVAL);
}
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}
/**
 * 登录:执行一次 verify(loginIntent=true,新设备永远赢);成功就缓存手机号 + 启动心跳。
 * 失败不缓存,UI 据 code 展示对应文案。
 */
async function login(phone) {
    const r = await verifyOnce(phone, true);
    if (r.ok) {
        saveCache({ ...loadCache(), phone });
        startHeartbeat(phone);
        logger_1.logger.info(`[License] login ok phone=${phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}`);
        // 登录拿到 accessToken 后,通知 LLM 配置重载,把云端 user_llm_config 灌进 runtime。
        // 用 require(同步)而不是 dynamic import,dev 模式下 native ts 解析 dynamic import
        // 找不到无扩展名的 .ts 模块。CommonJS require 走 require cache,跟其他地方的 llmConfig
        // 是同一实例,顶层 import 会触发循环依赖警告所以延后到这里 require。
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { llmConfig } = require('./llm-config');
            llmConfig.reloadIntoRuntime().catch((err) => logger_1.logger.warn(`[License] post-login LLM reload 失败: ${String(err)}`));
        }
        catch (err) {
            logger_1.logger.warn(`[License] post-login LLM reload require 失败: ${String(err)}`);
        }
    }
    else {
        logger_1.logger.warn(`[License] login fail code=${r.code} msg=${r.message}`);
    }
    return r;
}
function logout() {
    stopHeartbeat();
    cachedMemberData = null;
    const c = loadCache();
    delete c.phone;
    saveCache(c);
    logger_1.logger.info('[License] logout');
}
//# sourceMappingURL=license.js.map