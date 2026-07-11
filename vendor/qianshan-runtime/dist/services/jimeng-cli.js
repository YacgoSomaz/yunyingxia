"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JIMENG_CLI_MODELS = exports.JIMENG_CLI_DEFAULT_MODEL = void 0;
exports.findDreaminaExecutableSync = findDreaminaExecutableSync;
exports.checkJimengCliStatus = checkJimengCliStatus;
exports.loginJimengCli = loginJimengCli;
exports.logoutJimengCli = logoutJimengCli;
exports.checkJimengCliLogin = checkJimengCliLogin;
exports.generateJimengCliTextVideo = generateJimengCliTextVideo;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../utils/paths");
const logger_1 = require("../utils/logger");
exports.JIMENG_CLI_DEFAULT_MODEL = 'seedance-2.0-mini';
exports.JIMENG_CLI_MODELS = [
    { id: 'seedance-2.0-mini', label: 'Seedance 2.0 Mini', cliValue: 'seedance2.0mini' },
    { id: 'seedance-2.0-fast-vip', label: 'Seedance 2.0 Fast VIP', cliValue: 'seedance2.0fast_vip' },
    { id: 'seedance-2.0-vip', label: 'Seedance 2.0 VIP', cliValue: 'seedance2.0_vip' },
    { id: 'seedance-2.0-fast', label: 'Seedance 2.0 Fast', cliValue: 'seedance2.0fast' },
    { id: 'seedance-2.0', label: 'Seedance 2.0', cliValue: 'seedance2.0' },
];
function exeName() {
    return process.platform === 'win32' ? 'dreamina.exe' : 'dreamina';
}
function commandLookup(name) {
    const lookup = process.platform === 'win32' ? 'where' : 'which';
    const r = (0, child_process_1.spawnSync)(lookup, [name], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0)
        return null;
    const first = String(r.stdout || '')
        .split(/\r?\n/)
        .map((x) => x.trim())
        .find(Boolean);
    return first || null;
}
function findDreaminaExecutableSync() {
    const bin = exeName();
    const root = (0, paths_1.resourcesRoot)();
    const candidates = [
        path_1.default.join(root, 'backend-dist', 'dreamina', bin),
        path_1.default.join(root, 'bin', bin),
        path_1.default.join(root, 'dreamina', bin),
        path_1.default.join(os_1.default.homedir(), 'bin', bin),
    ];
    for (const p of candidates) {
        if (fs_1.default.existsSync(p))
            return p;
    }
    if (process.platform === 'win32') {
        return commandLookup('dreamina.exe') || commandLookup('dreamina') || commandLookup('dreamina.cmd');
    }
    return commandLookup('dreamina');
}
function requireDreaminaExecutable() {
    const p = findDreaminaExecutableSync();
    if (!p) {
        throw new Error(`未找到即梦 CLI(dreamina)。请把 ${exeName()} 放到 backend-dist/dreamina，或加入 PATH，或放到 ${path_1.default.join(os_1.default.homedir(), 'bin')}`);
    }
    return p;
}
function sanitizeCliText(text) {
    return String(text || '')
        .replace(/[\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ')
        .replace(/\r\n/g, '\n')
        .trim();
}
function dreaminaStateDir() {
    return path_1.default.join(os_1.default.homedir(), '.dreamina_cli');
}
function listDreaminaLogFiles(dir, depth = 0) {
    if (!fs_1.default.existsSync(dir) || depth > 2)
        return [];
    const files = [];
    for (const name of fs_1.default.readdirSync(dir)) {
        const p = path_1.default.join(dir, name);
        try {
            const st = fs_1.default.statSync(p);
            if (st.isDirectory()) {
                files.push(...listDreaminaLogFiles(p, depth + 1));
            }
            else if (/(\.log|dreamina\.log|\.log\.\d{4})/i.test(name)) {
                files.push(p);
            }
        }
        catch {
            // ignore race
        }
    }
    return files;
}
function readRecentCliPermission() {
    const logDir = path_1.default.join(dreaminaStateDir(), 'logs');
    const files = listDreaminaLogFiles(logDir)
        .map((p) => {
        try {
            return { p, mtimeMs: fs_1.default.statSync(p).mtimeMs };
        }
        catch {
            return null;
        }
    })
        .filter(Boolean)
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, 5);
    for (const file of files) {
        try {
            const text = fs_1.default.readFileSync(file.p, 'utf8');
            const matches = Array.from(text.matchAll(/has_cli_permission=(true|false)/gi));
            const latest = matches[matches.length - 1]?.[1]?.toLowerCase();
            if (latest === 'true')
                return true;
            if (latest === 'false')
                return false;
        }
        catch {
            // ignore unreadable log
        }
    }
    return undefined;
}
function parseCliOutput(stdout, stderr, code) {
    const raw = stdout.trim();
    const errText = stderr.trim();
    if (code !== 0) {
        return {
            success: false,
            error: errText || raw || `dreamina exited with code ${code}`,
            rawOutput: raw || errText,
            exitCode: code,
        };
    }
    if (!raw)
        return { success: true, data: null, rawOutput: raw, exitCode: code };
    try {
        const json = JSON.parse(raw);
        if (json && typeof json === 'object' && 'success' in json) {
            return {
                success: Boolean(json.success),
                data: json.data,
                error: json.success ? undefined : String(json.error || json.message || 'dreamina failed'),
                rawOutput: raw,
                exitCode: code,
            };
        }
        return { success: true, data: json, rawOutput: raw, exitCode: code };
    }
    catch {
        return { success: true, data: raw, rawOutput: raw, exitCode: code };
    }
}
function tryParseJsonObject(text) {
    try {
        const json = JSON.parse(String(text || '').trim());
        return json && typeof json === 'object' ? json : null;
    }
    catch {
        return null;
    }
}
function normalizeCreditCommandResult(result) {
    if (result.success)
        return result;
    const maybeJson = tryParseJsonObject(result.rawOutput || '') ||
        tryParseJsonObject(result.error || '');
    if (maybeJson && (maybeJson.total_credit != null || maybeJson.vip_level != null || maybeJson.user_id != null)) {
        return {
            success: true,
            data: maybeJson,
            rawOutput: JSON.stringify(maybeJson),
            exitCode: result.exitCode,
        };
    }
    return result;
}
function compactLogText(text, max = 800) {
    return text.replace(/\s+/g, ' ').trim().slice(0, max);
}
function runDreamina(args, timeoutMs = 10 * 60 * 1000) {
    const exe = requireDreaminaExecutable();
    logger_1.logger.info(`[JimengCLI] run ${exe} ${args.map((x) => (x.length > 80 ? x.slice(0, 80) + '...' : x)).join(' ')}`);
    return new Promise((resolve) => {
        let settled = false;
        let stdout = '';
        let stderr = '';
        const child = (0, child_process_1.spawn)(exe, args, {
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const finish = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (!result.success) {
                const out = compactLogText(stdout);
                const err = compactLogText(stderr);
                logger_1.logger.warn(`[JimengCLI] failed code=${result.exitCode ?? 'unknown'} error=${compactLogText(result.error || '')} stdout=${out || '-'} stderr=${err || '-'}`);
            }
            resolve(result);
        };
        const timer = setTimeout(() => {
            child.kill();
            finish({
                success: false,
                error: `dreamina 命令超时(${Math.round(timeoutMs / 1000)}s)`,
                rawOutput: stdout.trim() || stderr.trim(),
            });
        }, timeoutMs);
        child.stdout?.on('data', (d) => {
            stdout += Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        });
        child.stderr?.on('data', (d) => {
            stderr += Buffer.isBuffer(d) ? d.toString('utf8') : String(d);
        });
        child.on('error', (err) => {
            finish({ success: false, error: err.message, rawOutput: stderr.trim() || stdout.trim() });
        });
        child.on('close', (code) => {
            finish(parseCliOutput(stdout, stderr, code));
        });
    });
}
function parseLoginAuth(data, rawOutput) {
    const text = typeof data === 'string' ? data : String(rawOutput || '');
    const pick = (name) => {
        const m = text.match(new RegExp(`${name}:\\s*(.+)`));
        return m?.[1]?.trim() || '';
    };
    const verificationUri = pick('verification_uri');
    const userCode = pick('user_code');
    const deviceCode = pick('device_code');
    if (!verificationUri || !userCode || !deviceCode)
        return null;
    return {
        verificationUri,
        userCode,
        deviceCode,
        pollInterval: pick('poll_interval') || undefined,
        expiresAt: pick('expires_at') || undefined,
    };
}
function mapModel(model) {
    const picked = exports.JIMENG_CLI_MODELS.find((m) => m.id === model || m.cliValue === model) ||
        exports.JIMENG_CLI_MODELS.find((m) => m.id === exports.JIMENG_CLI_DEFAULT_MODEL);
    return picked;
}
function extractFirstString(data, keys) {
    if (!data || typeof data !== 'object')
        return '';
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
}
function extractSubmitId(data) {
    const direct = extractFirstString(data, ['submit_id', 'submitId', 'task_id', 'taskId', 'id']);
    if (direct)
        return direct;
    return extractFirstString(data?.data, ['submit_id', 'submitId', 'task_id', 'taskId', 'id']);
}
function normalizeStatus(data) {
    const status = extractFirstString(data, ['gen_status', 'status', 'state', 'task_status', 'taskStatus']) ||
        extractFirstString(data?.data, ['gen_status', 'status', 'state', 'task_status', 'taskStatus']);
    return status.toLowerCase();
}
function extractFailureReason(data) {
    return (extractFirstString(data, ['fail_reason', 'failReason', 'error', 'message', 'reason']) ||
        extractFirstString(data?.data, ['fail_reason', 'failReason', 'error', 'message', 'reason']));
}
function collectStrings(value, out = []) {
    if (typeof value === 'string') {
        out.push(value);
        return out;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            collectStrings(item, out);
        return out;
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value))
            collectStrings(item, out);
    }
    return out;
}
function extractLocalPath(data) {
    const keys = [
        'local_path',
        'localPath',
        'file_path',
        'filePath',
        'download_path',
        'downloadPath',
        'output_path',
        'outputPath',
        'path',
    ];
    const direct = extractFirstString(data, keys);
    if (direct && fs_1.default.existsSync(direct))
        return direct;
    for (const value of collectStrings(data)) {
        if (/\.(mp4|mov|webm)$/i.test(value) && fs_1.default.existsSync(value))
            return value;
    }
    return '';
}
function extractVideoUrl(data) {
    for (const value of collectStrings(data)) {
        if (/^https?:\/\/.+\.(mp4|mov|webm)(?:[?#].*)?$/i.test(value))
            return value;
    }
    return '';
}
function listVideoFiles(dir) {
    const out = new Map();
    if (!fs_1.default.existsSync(dir))
        return out;
    for (const name of fs_1.default.readdirSync(dir)) {
        const p = path_1.default.join(dir, name);
        try {
            const st = fs_1.default.statSync(p);
            if (st.isFile() && /\.(mp4|mov|webm)$/i.test(name))
                out.set(p, st.mtimeMs);
        }
        catch {
            // ignore race
        }
    }
    return out;
}
function findNewestNewVideo(before, dir) {
    const after = listVideoFiles(dir);
    const changed = Array.from(after.entries())
        .filter(([p, mtime]) => !before.has(p) || before.get(p) !== mtime)
        .sort((a, b) => b[1] - a[1]);
    return changed[0]?.[0] || '';
}
async function downloadVideo(url, destDir) {
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const ext = path_1.default.extname(new URL(url).pathname) || '.mp4';
    const localPath = path_1.default.join(destDir, `jimeng-${Date.now()}-${crypto_1.default.randomBytes(3).toString('hex')}${ext}`);
    const r = await fetch(url);
    if (!r.ok)
        throw new Error(`下载即梦视频失败 HTTP ${r.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await r.arrayBuffer()));
    return localPath;
}
async function queryResult(submitId, downloadDir) {
    const args = ['query_result', `--submit_id=${submitId}`];
    if (downloadDir)
        args.push(`--download_dir=${downloadDir}`);
    return runDreamina(args, 2 * 60 * 1000);
}
async function resolveDownloadedVideo(submitId, destDir, lastData) {
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const before = listVideoFiles(destDir);
    const downloaded = await queryResult(submitId, destDir);
    if (!downloaded.success) {
        throw new Error(downloaded.error || '即梦结果下载失败');
    }
    const localFromData = extractLocalPath(downloaded.data) || extractLocalPath(lastData);
    if (localFromData)
        return localFromData;
    const newest = findNewestNewVideo(before, destDir);
    if (newest)
        return newest;
    const url = extractVideoUrl(downloaded.data) || extractVideoUrl(lastData);
    if (url)
        return downloadVideo(url, destDir);
    throw new Error(`即梦任务已完成，但未找到下载后的视频文件:${JSON.stringify(downloaded.data).slice(0, 300)}`);
}
function isDoneStatus(status) {
    return ['success', 'succeeded', 'completed', 'complete', 'done', 'finished'].includes(status);
}
function isFailedStatus(status) {
    return ['fail', 'failed', 'error', 'canceled', 'cancelled', 'expired'].includes(status);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
let permissionCache = null;
async function readCreditAndPermission(force = false) {
    if (!force && permissionCache && Date.now() - permissionCache.checkedAt < 60 * 1000) {
        return {
            success: true,
            data: permissionCache.credit,
            hasCliPermission: permissionCache.hasCliPermission,
        };
    }
    const credit = normalizeCreditCommandResult(await runDreamina(['user_credit'], 30 * 1000));
    const hasCliPermission = credit.success ? readRecentCliPermission() : undefined;
    if (credit.success) {
        permissionCache = {
            checkedAt: Date.now(),
            hasCliPermission,
            credit: credit.data,
        };
    }
    return { ...credit, hasCliPermission };
}
async function assertCanGenerateWithJimengCli() {
    const status = await readCreditAndPermission();
    if (!status.success) {
        throw new Error(status.error || '即梦 CLI 未登录或无法读取额度');
    }
    if (status.hasCliPermission === false) {
        throw new Error('即梦账号已登录，但当前账号不是高级会员。即梦 CLI 生成需要高级会员及以上账号，请升级会员或切换到有权限的即梦账号。');
    }
}
async function checkJimengCliStatus() {
    const executable = findDreaminaExecutableSync();
    if (!executable) {
        return {
            installed: false,
            loggedIn: false,
            message: `未找到 ${exeName()}，请用官方脚本安装到 ${path_1.default.join(os_1.default.homedir(), 'bin')}，或放到 backend-dist/dreamina，或加入 PATH`,
            models: exports.JIMENG_CLI_MODELS,
        };
    }
    const credit = await readCreditAndPermission(true);
    if (!credit.success) {
        return {
            installed: true,
            executable,
            loggedIn: false,
            message: credit.error || '即梦 CLI 未登录或无法读取额度',
            models: exports.JIMENG_CLI_MODELS,
        };
    }
    return {
        installed: true,
        executable,
        loggedIn: true,
        hasCliPermission: credit.hasCliPermission,
        credit: credit.data,
        message: credit.hasCliPermission === false
            ? '即梦 CLI 生成需要高级会员及以上账号，请升级会员或切换账号'
            : undefined,
        models: exports.JIMENG_CLI_MODELS,
    };
}
async function loginJimengCli() {
    if (!findDreaminaExecutableSync()) {
        return checkJimengCliStatus();
    }
    const executable = findDreaminaExecutableSync() || undefined;
    const r = await runDreamina(['login', '--headless'], 60 * 1000);
    if (!r.success)
        throw new Error(r.error || '即梦登录失败');
    const auth = parseLoginAuth(r.data, r.rawOutput);
    if (auth) {
        return {
            installed: true,
            executable,
            loggedIn: false,
            message: '请在浏览器完成即梦授权，完成后回到工具点击确认',
            auth,
            models: exports.JIMENG_CLI_MODELS,
        };
    }
    return checkJimengCliStatus();
}
async function logoutJimengCli() {
    const executable = findDreaminaExecutableSync();
    if (!executable)
        return checkJimengCliStatus();
    const r = await runDreamina(['logout'], 30 * 1000);
    if (!r.success)
        throw new Error(r.error || '即梦退出登录失败');
    permissionCache = null;
    return {
        installed: true,
        executable,
        loggedIn: false,
        message: '已退出即梦登录',
        models: exports.JIMENG_CLI_MODELS,
    };
}
async function checkJimengCliLogin(deviceCode) {
    const executable = findDreaminaExecutableSync();
    if (!executable)
        return checkJimengCliStatus();
    const code = String(deviceCode || '').trim();
    if (!code) {
        return {
            installed: true,
            executable,
            loggedIn: false,
            message: '缺少即梦授权 device_code，请重新点击登录',
            models: exports.JIMENG_CLI_MODELS,
        };
    }
    const r = await runDreamina(['login', 'checklogin', `--device_code=${code}`, '--poll=0'], 15 * 1000);
    if (!r.success) {
        return {
            installed: true,
            executable,
            loggedIn: false,
            message: '即梦授权尚未完成，请先在浏览器完成授权',
            models: exports.JIMENG_CLI_MODELS,
        };
    }
    return checkJimengCliStatus();
}
async function generateJimengCliTextVideo(req, destDir, model = exports.JIMENG_CLI_DEFAULT_MODEL) {
    const startMs = Date.now();
    const picked = mapModel(model);
    const duration = Math.max(4, Math.min(15, Math.round(req.duration || 5)));
    const prompt = sanitizeCliText(req.prompt);
    if (!prompt)
        throw new Error('即梦生成失败: prompt 为空');
    await assertCanGenerateWithJimengCli();
    const submit = await runDreamina([
        'text2video',
        `--prompt=${prompt}`,
        `--duration=${duration}`,
        `--ratio=${req.aspect}`,
        '--video_resolution=720p',
        `--model_version=${picked.cliValue}`,
        '--poll=0',
    ], 3 * 60 * 1000);
    if (!submit.success) {
        throw new Error(`即梦提交失败:${submit.error || submit.rawOutput || 'unknown error'}`);
    }
    const submitId = extractSubmitId(submit.data);
    if (!submitId) {
        throw new Error(`即梦提交成功但未返回 submit_id:${JSON.stringify(submit.data).slice(0, 300)}`);
    }
    logger_1.logger.info(`[JimengCLI] submitted ${submitId} model=${picked.cliValue} aspect=${req.aspect} duration=${duration}`);
    const deadline = Date.now() + 30 * 60 * 1000;
    let lastData = null;
    while (Date.now() < deadline) {
        await sleep(8 * 1000);
        const q = await queryResult(submitId);
        if (!q.success) {
            throw new Error(`即梦查询失败:${q.error || q.rawOutput || 'unknown error'}`);
        }
        lastData = q.data;
        const status = normalizeStatus(q.data);
        logger_1.logger.info(`[JimengCLI] poll ${submitId} status=${status || 'unknown'}`);
        if (isDoneStatus(status)) {
            const localPath = await resolveDownloadedVideo(submitId, destDir, q.data);
            return {
                localPath,
                taskId: submitId,
                elapsedSec: (Date.now() - startMs) / 1000,
                costCny: 0,
                usedModel: picked.cliValue,
            };
        }
        if (isFailedStatus(status)) {
            throw new Error(`即梦生成失败:${extractFailureReason(q.data) || status}`);
        }
        const maybeUrl = extractVideoUrl(q.data);
        if (maybeUrl && !status) {
            const localPath = await downloadVideo(maybeUrl, destDir);
            return {
                localPath,
                taskId: submitId,
                elapsedSec: (Date.now() - startMs) / 1000,
                costCny: 0,
                usedModel: picked.cliValue,
            };
        }
    }
    throw new Error(`即梦生成超时:${submitId} ${JSON.stringify(lastData).slice(0, 200)}`);
}
//# sourceMappingURL=jimeng-cli.js.map