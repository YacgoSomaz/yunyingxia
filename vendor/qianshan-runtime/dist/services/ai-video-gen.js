"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VIDEO_PROVIDERS_LEGACY = exports.VIDEO_PROVIDERS_ACTIVE = void 0;
exports.normalizeVideoProvider = normalizeVideoProvider;
exports.getAdapter = getAdapter;
exports.listProviders = listProviders;
exports.validateVideoFile = validateVideoFile;
exports.generateBatch = generateBatch;
exports.regenerateOne = regenerateOne;
// ══════════════════════════════════════════════════════════════════════
//  AI 视频生成 — 完全云端化版本
//
//  入口:generateBatch(provider, requests, destDir) / regenerateOne(...)
//  内部:每次都从档位系统拿"用户当前 video 类云端配置",按 providerCode 分协议:
//    - 'aliyun_dashscope' → 百炼 video-synthesis async API
//    - 'wuyinkeji' → private async /api/async/video_grok_imagine
//    - 'cool' → private async /v1/cool/generate
//    - 其它(lingya/bltcy/geek) → OpenAI-compat /v1/videos
//        细分:veo_* model → chat/completions 同步;其它(wan/seedance/sora) → /v1/videos 异步轮询
//
//  桌面端不再有任何 provider 自带 adapter class,baseUrl/apiKey/model 全用云端那条。
// ══════════════════════════════════════════════════════════════════════
const llm_tier_config_1 = require("./llm-tier-config");
const cloud_llm_config_1 = require("./cloud-llm-config");
const jimeng_cli_1 = require("./jimeng-cli");
const logger_1 = require("../utils/logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
exports.VIDEO_PROVIDERS_ACTIVE = ['cloud', 'jimeng_cli'];
exports.VIDEO_PROVIDERS_LEGACY = [
    'jimeng', 'vidu', 'zhipu', 'happyhorse', 'lingyaai',
];
function normalizeVideoProvider(input) {
    const value = String(input || '').trim();
    if (value === 'jimeng_cli' || value === 'jimeng')
        return 'jimeng_cli';
    if (value === 'lingyaai')
        return 'lingyaai';
    return 'cloud';
}
// ─────────────────────────────────────────────────────────────────────────
// 取云端 video 配置(包含解密 apiKey)
// ─────────────────────────────────────────────────────────────────────────
/** OpenAI-compat baseUrl 归一化:确保末尾带 /v1(用户云端配的可能是裸根域名) */
function normalizeOpenAICompatBaseUrl(baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (/\/v\d+$/.test(trimmed))
        return trimmed;
    return `${trimmed}/v1`;
}
const PRIVATE_ASYNC_VIDEO_PROVIDERS = new Set(['wuyinkeji', 'cool']);
function stripV1Suffix(baseUrl) {
    return baseUrl.replace(/\/+$/, '').replace(/\/v\d+$/i, '');
}
function normalizeVideoBaseUrl(providerCode, baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (providerCode === 'aliyun_dashscope')
        return trimmed;
    if (PRIVATE_ASYNC_VIDEO_PROVIDERS.has(providerCode))
        return stripV1Suffix(trimmed);
    return normalizeOpenAICompatBaseUrl(trimmed);
}
async function loadActiveVideoConfig() {
    const r = await llm_tier_config_1.llmTierConfig.resolveCategory('video');
    if (!r || !r.cloudId || !r.providerCode || !r.baseUrl) {
        return { ok: false, reason: 'no-config' };
    }
    let apiKey = null;
    try {
        apiKey = await (0, cloud_llm_config_1.getDecryptedKey)(r.cloudId);
    }
    catch (err) {
        return { ok: false, reason: 'no-key', detail: String(err?.message || err) };
    }
    if (!apiKey) {
        return { ok: false, reason: 'no-key', detail: 'decrypt-key 返回空' };
    }
    // dashscope uses a fixed URL. Private async providers must not receive /v1.
    const baseUrl = normalizeVideoBaseUrl(r.providerCode, r.baseUrl);
    return {
        ok: true,
        providerCode: r.providerCode,
        baseUrl,
        apiKey,
        model: r.model,
    };
}
// ─────────────────────────────────────────────────────────────────────────
// OpenAI-compat 分支(灵芽 + 同协议中转)
// ─────────────────────────────────────────────────────────────────────────
function getOpenAICompatModelKind(model) {
    if (model.startsWith('veo_'))
        return 'chat-sync';
    return 'video-async';
}
function buildAsyncVideoBody(model, req) {
    const duration = Math.max(3, Math.min(10, req.duration || 5));
    const ratio = req.aspect;
    if (/^wan2\.7/.test(model)) {
        return { model, input: { prompt: req.prompt }, parameters: { resolution: '1080P', ratio, duration } };
    }
    if (model.startsWith('wan')) {
        const size = req.aspect === '9:16' ? '480*832' : req.aspect === '16:9' ? '832*480' : '640*640';
        return { model, input: { prompt: req.prompt }, parameters: { size, duration } };
    }
    if (/seedance|doubao/i.test(model)) {
        return { model, prompt: req.prompt, resolution: '720p', ratio, duration };
    }
    if (model.startsWith('sora-')) {
        const size = req.aspect === '9:16' ? '720x1280' : '1280x720';
        return { model, prompt: req.prompt, size, seconds: String(duration) };
    }
    const size = req.aspect === '9:16' ? '720x1280' : '1280x720';
    return { model, prompt: req.prompt, size, seconds: String(duration) };
}
function extractOpenAICompatVideoUrl(json) {
    const candidates = [
        json?.video_url,
        json?.videoUrl,
        json?.url,
        json?.data?.video_url,
        json?.data?.videoUrl,
        json?.data?.url,
        Array.isArray(json?.data) ? json.data[0]?.url : undefined,
        Array.isArray(json?.data) ? json.data[0]?.video_url : undefined,
        json?.output?.video_url,
        json?.output?.videoUrl,
        json?.output?.url,
        Array.isArray(json?.output) ? json.output[0] : undefined,
        Array.isArray(json?.output) ? json.output[0]?.url : undefined,
        Array.isArray(json?.output) ? json.output[0]?.video_url : undefined,
        json?.result?.video_url,
        json?.result?.videoUrl,
        json?.result?.url,
    ];
    for (const value of candidates) {
        if (typeof value === 'string' && /^https?:\/\//i.test(value))
            return value;
    }
    const urls = [];
    collectHttpUrls(json, urls);
    return urls.find((url) => /\.(mp4|webm|mov)(?:[?#]|$)/i.test(url)) || urls[0] || '';
}
function isOpenAICompatVideoDone(status) {
    return ['complete', 'completed', 'succeeded', 'success', 'done', 'finished'].includes(status);
}
function isOpenAICompatVideoFailed(status) {
    return ['failed', 'fail', 'error', 'cancelled', 'canceled', 'expired'].includes(status);
}
function buildChatVideoBody(model, req) {
    const duration = Math.max(3, Math.min(10, req.duration || 5));
    const aspectLabel = req.aspect === '16:9' ? '16:9 LANDSCAPE HORIZONTAL'
        : req.aspect === '9:16' ? '9:16 PORTRAIT VERTICAL'
            : '1:1 SQUARE';
    const promptWithHint = `[ASPECT_RATIO=${aspectLabel}]\n${req.prompt}\n\n[OUTPUT FORMAT: aspect_ratio must be ${req.aspect} ${aspectLabel}]`;
    return {
        model,
        messages: [{ role: 'user', content: promptWithHint }],
        aspect_ratio: req.aspect,
        aspectRatio: req.aspect,
        resolution: '1080p',
        duration,
        parameters: { aspect_ratio: req.aspect, aspectRatio: req.aspect, resolution: '1080p', durationSeconds: duration },
        extra_body: { aspect_ratio: req.aspect, aspectRatio: req.aspect, resolution: '1080p', duration },
    };
}
async function generateViaOpenAICompat(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    const kind = getOpenAICompatModelKind(model);
    if (kind === 'chat-sync') {
        const body = buildChatVideoBody(model, req);
        logger_1.logger.info(`[AIVideo][${model}] chat-sync: "${req.prompt.slice(0, 80)}..." aspect=${req.aspect}`);
        const r = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });
        const text = await r.text();
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = null;
        }
        if (!r.ok || !json) {
            const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
            throw new Error(`视频生成失败(${model}):HTTP ${r.status} ${snippet}`);
        }
        const content = json?.choices?.[0]?.message?.content || '';
        const m = content.match(/\((https?:[^)]+\.(?:mp4|webm|mov))\)/i)
            || content.match(/(https?:[^\s)]+\.(?:mp4|webm|mov))/i);
        const videoUrl = m?.[1] || '';
        if (!videoUrl)
            throw new Error(`视频返回未找到 URL(${model}):${content.slice(0, 200)}`);
        const taskId = json?.id || `veo-${Date.now()}`;
        const localName = `cv-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
        const localPath = path_1.default.join(destDir, localName);
        const dl = await fetch(videoUrl);
        if (!dl.ok)
            throw new Error(`下载视频失败 HTTP ${dl.status}`);
        fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
        const elapsedSec = (Date.now() - startMs) / 1000;
        return { localPath, taskId: String(taskId), elapsedSec, costCny: 0.5, usedModel: model };
    }
    // video-async 分支(wan / seedance / sora / grok-video)
    const body = buildAsyncVideoBody(model, req);
    const sizeLog = typeof body.size === 'string' ? ` size=${body.size}` : '';
    logger_1.logger.info(`[AIVideo][${model}] async: "${req.prompt.slice(0, 80)}..." aspect=${req.aspect}${sizeLog}`);
    const createRes = await fetch(`${baseUrl}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
    });
    const createJson = (await createRes.json());
    if (!createRes.ok) {
        const msg = createJson?.error?.message || createJson?.message || `HTTP ${createRes.status}`;
        throw new Error(`视频创建任务失败(${model}):${msg}`);
    }
    const taskId = createJson?.id || createJson?.task_id || '';
    if (!taskId) {
        throw new Error(`视频返回结构异常,未找到 task_id:${JSON.stringify(createJson).slice(0, 200)}`);
    }
    const MAX_WAIT = 10 * 60 * 1000;
    const POLL_INTERVAL = 8000;
    const pollStart = Date.now();
    let videoUrl = '';
    while (Date.now() - pollStart < MAX_WAIT) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        try {
            const pollRes = await fetch(`${baseUrl}/videos/${taskId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const pollJson = (await pollRes.json());
            if (!pollRes.ok)
                continue;
            const status = String(pollJson?.status || '').toLowerCase();
            logger_1.logger.info(`[AIVideo][${model}:${taskId}] status=${status || 'unknown'}`);
            if (isOpenAICompatVideoDone(status)) {
                videoUrl = extractOpenAICompatVideoUrl(pollJson);
                if (!videoUrl)
                    throw new Error(`视频任务完成但返回结构异常`);
                break;
            }
            if (isOpenAICompatVideoFailed(status)) {
                const msg = pollJson?.error?.message || pollJson?.error || '未知错误';
                throw new Error(`视频生成失败(${model}):${msg}`);
            }
        }
        catch (err) {
            if (/视频/.test(String(err?.message)))
                throw err;
            logger_1.logger.warn(`[AIVideo][${model}] poll retry: ${String(err?.message || err)}`);
        }
    }
    if (!videoUrl)
        throw new Error(`视频超时(10 分钟未完成,task=${taskId})`);
    const localName = `cv-${taskId.slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
    const localPath = path_1.default.join(destDir, localName);
    const dl = await fetch(videoUrl);
    if (!dl.ok)
        throw new Error(`下载视频失败 HTTP ${dl.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
    const elapsedSec = (Date.now() - startMs) / 1000;
    return { localPath, taskId, elapsedSec, costCny: 0.5, usedModel: model };
}
function buildWuyinkejiDuration(duration) {
    const seconds = Math.max(6, Math.round(duration || 6));
    if (seconds <= 6)
        return '6';
    if (seconds <= 10)
        return '10';
    return '15';
}
function extractWuyinkejiTaskId(json) {
    const value = json?.data?.id ||
        json?.data?.task_id ||
        json?.data?.taskId ||
        json?.task_id ||
        json?.taskId ||
        json?.id;
    return value == null ? '' : String(value);
}
function collectHttpUrls(value, out, depth = 0) {
    if (value == null || depth > 6)
        return;
    if (typeof value === 'string') {
        const normalized = value.replace(/\\\//g, '/');
        if (/^https?:\/\//i.test(normalized))
            out.push(normalized);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            collectHttpUrls(item, out, depth + 1);
        return;
    }
    if (typeof value === 'object') {
        for (const item of Object.values(value))
            collectHttpUrls(item, out, depth + 1);
    }
}
function extractWuyinkejiVideoUrl(json, rawText) {
    const urls = [];
    const priorityNodes = [
        json?.data?.result,
        json?.result,
        json?.data?.video_url,
        json?.data?.videoUrl,
        json?.data?.url,
        json?.data?.output,
        json?.output,
    ];
    for (const node of priorityNodes)
        collectHttpUrls(node, urls);
    if (urls.length === 0)
        collectHttpUrls(json, urls);
    const normalizedText = rawText.replace(/\\\//g, '/');
    const rawUrlMatches = normalizedText.match(/https?:\/\/[^"'\s\\]+/g) || [];
    urls.push(...rawUrlMatches);
    const deduped = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
    return deduped.find((url) => /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(url)) || deduped[0] || '';
}
function extractWuyinkejiStatus(json, rawText) {
    const value = json?.data?.status ??
        json?.data?.task_status ??
        json?.data?.taskStatus ??
        json?.status ??
        json?.task_status ??
        json?.taskStatus ??
        json?.output?.task_status;
    if (value != null)
        return String(value).toLowerCase();
    const match = rawText.match(/"status"\s*:\s*("?)([^",}\]]+)\1/i);
    return match?.[2]?.toLowerCase() || '';
}
function isWuyinkejiDoneStatus(status) {
    return ['2', 'success', 'succeeded', 'completed', 'finished', 'done'].includes(status);
}
function isWuyinkejiFailedStatus(status) {
    return ['3', '4', '-1', 'failed', 'fail', 'error', 'expired', 'cancelled', 'canceled'].includes(status);
}
function extractWuyinkejiErrorMessage(json, rawText) {
    const value = json?.data?.message ||
        json?.data?.msg ||
        json?.data?.fail_reason ||
        json?.message ||
        json?.msg ||
        json?.error?.message ||
        json?.error;
    return String(value || rawText.slice(0, 200) || 'unknown error');
}
async function generateViaWuyinkejiGrokImagine(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    const cleanBase = stripV1Suffix(baseUrl);
    const submitUrl = `${cleanBase}/api/async/video_grok_imagine`;
    const detailUrl = `${cleanBase}/api/async/detail`;
    const requestedModel = model || 'grok_imagine';
    const usedModel = 'grok_imagine';
    if (requestedModel !== usedModel) {
        logger_1.logger.warn(`[AIVideo][wuyinkeji:${usedModel}] cloud modelName=${requestedModel} ignored; endpoint is model-specific`);
    }
    const duration = buildWuyinkejiDuration(req.duration);
    const body = {
        prompt: req.prompt,
        duration,
        aspect_ratio: req.aspect,
    };
    if (req.referenceImagePath && /^https?:\/\//i.test(req.referenceImagePath)) {
        body.image_urls = [req.referenceImagePath];
    }
    else if (req.referenceImagePath) {
        logger_1.logger.warn(`[AIVideo][wuyinkeji:${usedModel}] local reference image ignored: ${req.referenceImagePath}`);
    }
    logger_1.logger.info(`[AIVideo][wuyinkeji:${usedModel}] POST ${submitUrl} duration=${duration}s aspect=${req.aspect}`);
    let submitRes;
    try {
        submitRes = await fetch(`${submitUrl}?key=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (err) {
        throw new Error(`五音科技 Grok Imagine 提交网络异常:${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        logger_1.logger.warn(`[AIVideo][wuyinkeji:${usedModel}] submit HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
        throw new Error(`五音科技 Grok Imagine 提交失败 HTTP ${submitRes.status}:${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`五音科技 Grok Imagine 提交响应非 JSON:${submitText.slice(0, 200)}`);
    }
    const code = submitJson?.code;
    if (code != null && code !== 0 && code !== 200) {
        throw new Error(`五音科技 Grok Imagine 提交业务码异常 code=${code} msg=${extractWuyinkejiErrorMessage(submitJson, submitText)}`);
    }
    const taskId = extractWuyinkejiTaskId(submitJson);
    if (!taskId) {
        throw new Error(`五音科技 Grok Imagine 提交未返回 task_id:${submitText.slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIVideo][wuyinkeji:${usedModel}] task submitted: task_id=${taskId}`);
    const deadline = Date.now() + 10 * 60 * 1000;
    const POLL_INTERVAL = 8000;
    let videoUrl = '';
    let lastStatus = '';
    let lastLoggedAt = 0;
    let firstPollLogged = false;
    let lastPollBody = '';
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        let pollRes;
        try {
            pollRes = await fetch(`${detailUrl}?id=${encodeURIComponent(taskId)}&key=${encodeURIComponent(apiKey)}`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: apiKey,
                },
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIVideo][wuyinkeji:${taskId}] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        const pollText = await pollRes.text();
        lastPollBody = pollText;
        if (!pollRes.ok) {
            logger_1.logger.warn(`[AIVideo][wuyinkeji:${taskId}] poll HTTP ${pollRes.status}: ${pollText.slice(0, 200)}`);
            continue;
        }
        if (!firstPollLogged) {
            logger_1.logger.info(`[AIVideo][wuyinkeji:${taskId}] first poll body=${pollText.slice(0, 600)}`);
            firstPollLogged = true;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            pollJson = null;
        }
        const status = extractWuyinkejiStatus(pollJson, pollText);
        const maybeVideoUrl = extractWuyinkejiVideoUrl(pollJson, pollText);
        if (status && (status !== lastStatus || Date.now() - lastLoggedAt > 30000)) {
            logger_1.logger.info(`[AIVideo][wuyinkeji:${taskId}] status=${status} elapsed=${((Date.now() - startMs) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (maybeVideoUrl && (!status || isWuyinkejiDoneStatus(status))) {
            videoUrl = maybeVideoUrl;
            break;
        }
        if (isWuyinkejiDoneStatus(status)) {
            throw new Error(`五音科技 Grok Imagine status=${status} 但未返回视频 URL:${pollText.slice(0, 300)}`);
        }
        if (isWuyinkejiFailedStatus(status)) {
            throw new Error(`五音科技 Grok Imagine 任务失败:${extractWuyinkejiErrorMessage(pollJson, pollText)}`);
        }
    }
    if (!videoUrl) {
        logger_1.logger.warn(`[AIVideo][wuyinkeji:${taskId}] timeout lastStatus=${lastStatus || 'unknown'} lastBody=${lastPollBody.slice(0, 600)}`);
        throw new Error(`五音科技 Grok Imagine 视频超时(task=${taskId}, lastStatus=${lastStatus || 'unknown'})`);
    }
    logger_1.logger.info(`[AIVideo][wuyinkeji:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    const localName = `wyk-grok-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
    const localPath = path_1.default.join(destDir, localName);
    const dl = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!dl.ok)
        throw new Error(`下载五音科技 Grok Imagine 视频失败 HTTP ${dl.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIVideo][wuyinkeji:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return {
        localPath,
        taskId,
        elapsedSec,
        costCny: Number(duration) * 0.05,
        usedModel,
        fallbackInfo: requestedModel === usedModel
            ? undefined
            : {
                requestedModel,
                actualModel: usedModel,
                reason: 'wuyinkeji video_grok_imagine is a model-specific endpoint',
            },
    };
}
// ─────────────────────────────────────────────────────────────────────────
// Cool 网关(mjapi.cc.cd / coolapis)视频异步分支
//
// 提交: POST {base}/v1/cool/generate
// 轮询: GET  {base}/v1/cool/task/{taskId}
// Body:   { prompt, model, ratio, duration, files? }
// ─────────────────────────────────────────────────────────────────────────
function normalizeCoolBaseUrl(baseUrl) {
    const cleanBase = stripV1Suffix(baseUrl);
    try {
        const url = new URL(cleanBase);
        if (url.hostname === 'panel.mjapi.cc.cd') {
            url.hostname = 'api.mjapi.cc.cd';
            url.pathname = '';
            url.search = '';
            url.hash = '';
            return url.toString().replace(/\/+$/, '');
        }
    }
    catch {
        // Keep the caller-provided URL when it is not parseable; the request error will surface it.
    }
    return cleanBase;
}
function extractCoolTaskId(json) {
    const value = json?.task_id ||
        json?.taskId ||
        json?.id ||
        json?.data?.task_id ||
        json?.data?.taskId ||
        json?.data?.id;
    return value == null ? '' : String(value);
}
function extractCoolStatus(json, rawText) {
    const value = json?.status ??
        json?.task_status ??
        json?.taskStatus ??
        json?.data?.status ??
        json?.data?.task_status ??
        json?.data?.taskStatus ??
        json?.result?.status;
    if (value != null)
        return String(value).toLowerCase();
    const match = rawText.match(/"status"\s*:\s*("?)([^",}\]]+)\1/i);
    return match?.[2]?.toLowerCase() || '';
}
function isCoolDoneStatus(status) {
    return ['2', 'success', 'succeeded', 'completed', 'complete', 'finished', 'done'].includes(status);
}
function isCoolFailedStatus(status) {
    return ['3', '4', '-1', 'failed', 'fail', 'error', 'expired', 'cancelled', 'canceled'].includes(status);
}
function extractCoolVideoUrl(json, rawText) {
    const urls = [];
    const priorityNodes = [
        json?.result?.url,
        json?.result?.video_url,
        json?.result?.videoUrl,
        json?.data?.result?.url,
        json?.data?.result?.video_url,
        json?.data?.result?.videoUrl,
        json?.data?.video_url,
        json?.data?.videoUrl,
        json?.data?.url,
        json?.video_url,
        json?.videoUrl,
        json?.url,
        json?.output?.video_url,
        json?.output?.videoUrl,
        json?.output?.url,
    ];
    for (const node of priorityNodes)
        collectHttpUrls(node, urls);
    if (urls.length === 0)
        collectHttpUrls(json, urls);
    const normalizedText = rawText.replace(/\\\//g, '/');
    const rawUrlMatches = normalizedText.match(/https?:\/\/[^"'\s\\]+/g) || [];
    urls.push(...rawUrlMatches);
    const deduped = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
    return (deduped.find((url) => /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(url)) ||
        deduped.find((url) => !/\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(url)) ||
        '');
}
function extractCoolErrorMessage(json, rawText) {
    const value = json?.error?.message ||
        json?.error ||
        json?.message ||
        json?.msg ||
        json?.data?.error?.message ||
        json?.data?.error ||
        json?.data?.message ||
        json?.data?.msg;
    return String(value || rawText.slice(0, 200) || 'unknown error');
}
async function generateViaCoolVideo(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    const duration = Math.max(4, Math.min(10, Math.round(req.duration || 5)));
    const cleanBase = normalizeCoolBaseUrl(baseUrl);
    const submitUrl = `${cleanBase}/v1/cool/generate`;
    const tasksBase = `${cleanBase}/v1/cool/task/`;
    const body = {
        prompt: req.prompt,
        model,
        ratio: req.aspect,
        duration,
    };
    if (req.referenceImagePath && /^https?:\/\//i.test(req.referenceImagePath)) {
        body.files = [{ url: req.referenceImagePath, type: 'image' }];
    }
    else if (req.referenceImagePath) {
        logger_1.logger.warn(`[AIVideo][cool:${model}] local reference image ignored: ${req.referenceImagePath}`);
    }
    logger_1.logger.info(`[AIVideo][cool:${model}] POST ${submitUrl} ratio=${req.aspect} duration=${duration}s`);
    let submitRes;
    try {
        submitRes = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
        });
    }
    catch (err) {
        throw new Error(`Cool 视频提交网络异常:${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        logger_1.logger.warn(`[AIVideo][cool:${model}] submit HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
        throw new Error(`Cool 视频提交失败 HTTP ${submitRes.status}:${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`Cool 视频提交响应非 JSON:${submitText.slice(0, 200)}`);
    }
    const taskId = extractCoolTaskId(submitJson);
    if (!taskId) {
        throw new Error(`Cool 视频提交未返回 task_id:${submitText.slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIVideo][cool:${model}] task submitted: task_id=${taskId}`);
    const deadline = Date.now() + 10 * 60 * 1000;
    const POLL_INTERVAL = 5000;
    let videoUrl = '';
    let lastStatus = '';
    let lastLoggedAt = 0;
    let firstPollLogged = false;
    let lastPollBody = '';
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        let pollRes;
        try {
            pollRes = await fetch(`${tasksBase}${encodeURIComponent(taskId)}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(20000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIVideo][cool:${taskId}] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        const pollText = await pollRes.text();
        lastPollBody = pollText;
        if (!pollRes.ok) {
            logger_1.logger.warn(`[AIVideo][cool:${taskId}] poll HTTP ${pollRes.status}: ${pollText.slice(0, 200)}`);
            continue;
        }
        if (!firstPollLogged) {
            logger_1.logger.info(`[AIVideo][cool:${taskId}] first poll body=${pollText.slice(0, 600)}`);
            firstPollLogged = true;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            pollJson = null;
        }
        const status = extractCoolStatus(pollJson, pollText);
        const maybeVideoUrl = extractCoolVideoUrl(pollJson, pollText);
        if (status && (status !== lastStatus || Date.now() - lastLoggedAt > 30000)) {
            logger_1.logger.info(`[AIVideo][cool:${taskId}] status=${status} elapsed=${((Date.now() - startMs) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (maybeVideoUrl && (!status || isCoolDoneStatus(status))) {
            videoUrl = maybeVideoUrl;
            break;
        }
        if (isCoolDoneStatus(status)) {
            throw new Error(`Cool 视频 status=${status} 但未返回视频 URL:${pollText.slice(0, 300)}`);
        }
        if (isCoolFailedStatus(status)) {
            throw new Error(`Cool 视频任务失败:${extractCoolErrorMessage(pollJson, pollText)}`);
        }
    }
    if (!videoUrl) {
        logger_1.logger.warn(`[AIVideo][cool:${taskId}] timeout lastStatus=${lastStatus || 'unknown'} lastBody=${lastPollBody.slice(0, 600)}`);
        throw new Error(`Cool 视频超时(task=${taskId}, lastStatus=${lastStatus || 'unknown'})`);
    }
    logger_1.logger.info(`[AIVideo][cool:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    const localName = `cool-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
    const localPath = path_1.default.join(destDir, localName);
    const dl = await fetch(videoUrl, { signal: AbortSignal.timeout(120000) });
    if (!dl.ok)
        throw new Error(`下载 Cool 视频失败 HTTP ${dl.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIVideo][cool:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return { localPath, taskId, elapsedSec, costCny: duration * 0.2, usedModel: model };
}
// ─────────────────────────────────────────────────────────────────────────
// 阿里云百炼 video-synthesis async 分支
// ─────────────────────────────────────────────────────────────────────────
async function generateViaDashscope(apiKey, model, req, destDir) {
    const startMs = Date.now();
    const duration = Math.max(3, Math.min(10, req.duration || 5));
    const sizeMap = {
        '9:16': '720*1280',
        '16:9': '1280*720',
        '1:1': '1024*1024',
    };
    const size = sizeMap[req.aspect] || '1280*720';
    logger_1.logger.info(`[AIVideo][dashscope:${model}] async: "${req.prompt.slice(0, 80)}..." size=${size}`);
    // ① 提交任务(带 30s 超时,避免无响应卡死)
    let submitRes;
    try {
        submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'X-DashScope-Async': 'enable',
            },
            body: JSON.stringify({
                model,
                input: { prompt: req.prompt },
                parameters: { size, duration },
            }),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (err) {
        throw new Error(`百炼视频提交网络异常:${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        logger_1.logger.warn(`[AIVideo][dashscope:${model}] submit HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
        throw new Error(`百炼视频提交失败 HTTP ${submitRes.status}:${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`百炼视频提交响应非 JSON:${submitText.slice(0, 200)}`);
    }
    const taskId = submitJson?.output?.task_id;
    if (!taskId) {
        logger_1.logger.warn(`[AIVideo][dashscope:${model}] submit no task_id, body=${JSON.stringify(submitJson).slice(0, 300)}`);
        throw new Error(`百炼视频提交未返回 task_id:${JSON.stringify(submitJson).slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIVideo][dashscope:${model}] task submitted: task_id=${taskId}`);
    // ② 轮询(最多 10 分钟,每 8s 一次,每 30s 打一条进度 log)
    const MAX_WAIT = 10 * 60 * 1000;
    const POLL_INTERVAL = 8000;
    const pollStart = Date.now();
    let videoUrl = '';
    let lastStatus = '';
    let lastLoggedAt = 0;
    while (Date.now() - pollStart < MAX_WAIT) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        let pollRes;
        try {
            pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIVideo][dashscope] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        const pollText = await pollRes.text();
        if (!pollRes.ok) {
            logger_1.logger.warn(`[AIVideo][dashscope:${taskId}] poll HTTP ${pollRes.status}: ${pollText.slice(0, 200)}`);
            continue;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            continue;
        }
        const status = String(pollJson?.output?.task_status || '');
        // 状态变化 / 每 30s 打一次进度
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[AIVideo][dashscope:${taskId}] status=${status} elapsed=${((Date.now() - pollStart) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 'SUCCEEDED') {
            videoUrl = pollJson?.output?.video_url || pollJson?.output?.results?.[0]?.url || '';
            if (!videoUrl) {
                logger_1.logger.warn(`[AIVideo][dashscope:${taskId}] SUCCEEDED but no video_url, body=${JSON.stringify(pollJson).slice(0, 300)}`);
                throw new Error('百炼视频任务完成但返回无 video_url');
            }
            break;
        }
        if (status === 'FAILED' || status === 'UNKNOWN') {
            const rawMsg = String(pollJson?.output?.message || pollJson?.output?.code || '未知原因');
            // 阿里云"绿网"内容审核拒绝 → 翻译成友好中文,帮用户定位"改画面"
            // "Green net check failed" 是平台原文,普通用户看不懂;且这不是 bug,是百炼审核策略,
            // 改 prompt 避开敏感词(政治/军事/暴力/地缘等)就能过
            if (/green\s*net\s*check|content.*(moderat|violat|filter|policy)|inappropriate|敏感|审核未通过|违规/i.test(rawMsg)) {
                throw new Error(`内容审核未通过 — 这条分镜的画面描述含政治/军事/暴力等敏感内容,百炼平台拒绝生成。建议点"改画面"编辑 prompt,把敏感词换成中性表述。(原始报错:${rawMsg.slice(0, 80)})`);
            }
            throw new Error(`百炼视频任务失败:${rawMsg}`);
        }
    }
    if (!videoUrl)
        throw new Error(`百炼视频超时(task=${taskId})`);
    // ③ 下载
    logger_1.logger.info(`[AIVideo][dashscope:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    const localName = `dash-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
    const localPath = path_1.default.join(destDir, localName);
    const dl = await fetch(videoUrl);
    if (!dl.ok)
        throw new Error(`下载百炼视频失败 HTTP ${dl.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIVideo][dashscope:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return { localPath, taskId: String(taskId), elapsedSec, costCny: 0.5, usedModel: model };
}
// ─────────────────────────────────────────────────────────────────────────
// 火山方舟 ARK Seedance 异步分支(volcengine_ark)
//
// 协议要点:
//   - 端点完全写死(忽略云端 baseUrl):
//       提交: POST  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
//       轮询: GET   https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}
//   - Auth: `Authorization: Bearer ${apiKey}`(ARK key)
//   - Body 跟百炼 video-synthesis 完全不同:
//       content: [{type:'text', text: prompt}]  (而非 input.text)
//       ratio / resolution / duration / watermark / generate_audio 直接放 body 根
//   - 状态枚举: queued | running | succeeded | failed | expired | cancelled(全小写)
//   - 视频 URL 在 content.video_url(24h 过期,立即下载)
//   - 任务历史保留 7 天,过期后 status=expired
// ─────────────────────────────────────────────────────────────────────────
const VOLC_ARK_VIDEO_SUBMIT = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks';
const VOLC_ARK_VIDEO_POLL_BASE = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/';
/** ARK Seedance ratio 直接接受 '9:16'/'16:9'/'1:1' 字符串,不用转换 */
function buildArkRatio(aspect) {
    return aspect; // ARK 文档明确支持这三个值
}
async function generateViaVolcengineArkVideo(apiKey, model, req, destDir) {
    const startMs = Date.now();
    const ratio = buildArkRatio(req.aspect);
    // Seedance 2.0 支持 4-15 秒,我们 req.duration 通常 5,夹紧到合法范围
    const duration = Math.max(4, Math.min(15, Math.round(req.duration ?? 5)));
    // ① 提交任务 — Body 字段严格按官方文档(82379/1520757):
    //   - model / content / ratio / resolution / duration:核心必传
    //   - watermark:默认 false,不传即可
    //   - generate_audio:文档 body 字段表未列出明确支持(response 里出现 ≠ request 接受),不传
    //   - seed:默认 -1,不传即可
    //   - camera_fixed:Seedance 2.0 系列暂不支持,不传
    const submitBody = {
        model,
        content: [{ type: 'text', text: req.prompt }],
        ratio,
        resolution: '1080p', // 480p / 720p / 1080p。2.0 fast 不支持 1080p
        duration,
    };
    logger_1.logger.info(`[AIVideo][ARK:${model}] submit ratio=${ratio} duration=${duration}s`);
    let submitRes;
    try {
        submitRes = await fetch(VOLC_ARK_VIDEO_SUBMIT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(submitBody),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (err) {
        throw new Error(`火山方舟视频提交网络异常:${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        logger_1.logger.warn(`[AIVideo][ARK:${model}] submit HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
        throw new Error(`火山方舟视频提交失败 HTTP ${submitRes.status}:${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`火山方舟视频提交响应非 JSON:${submitText.slice(0, 200)}`);
    }
    const taskId = submitJson?.id || '';
    if (!taskId) {
        throw new Error(`火山方舟视频提交未返回 id:${JSON.stringify(submitJson).slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIVideo][ARK:${model}] task submitted: id=${taskId}`);
    // ② 轮询(最多 10 分钟,每 5s 一次)
    const MAX_WAIT = 10 * 60 * 1000;
    const POLL_INTERVAL = 5000;
    const pollStart = Date.now();
    let videoUrl = '';
    let lastStatus = '';
    let lastLoggedAt = 0;
    while (Date.now() - pollStart < MAX_WAIT) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        let pollRes;
        try {
            pollRes = await fetch(`${VOLC_ARK_VIDEO_POLL_BASE}${encodeURIComponent(taskId)}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIVideo][ARK] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        const pollText = await pollRes.text();
        if (!pollRes.ok) {
            logger_1.logger.warn(`[AIVideo][ARK:${taskId}] poll HTTP ${pollRes.status}: ${pollText.slice(0, 200)}`);
            continue;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            continue;
        }
        const status = String(pollJson?.status || '').toLowerCase();
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[AIVideo][ARK:${taskId}] status=${status} elapsed=${((Date.now() - pollStart) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 'succeeded') {
            videoUrl = pollJson?.content?.video_url || '';
            if (!videoUrl) {
                logger_1.logger.warn(`[AIVideo][ARK:${taskId}] succeeded but no video_url, body=${JSON.stringify(pollJson).slice(0, 300)}`);
                throw new Error('火山方舟视频任务完成但返回无 video_url');
            }
            break;
        }
        if (status === 'failed' || status === 'expired' || status === 'cancelled') {
            const errInfo = pollJson?.error || {};
            throw new Error(`火山方舟视频任务${status}:${errInfo.message || errInfo.code || JSON.stringify(errInfo)}`);
        }
    }
    if (!videoUrl)
        throw new Error(`火山方舟视频超时(task=${taskId})`);
    // ③ 下载(24h CDN URL,立即存盘)
    logger_1.logger.info(`[AIVideo][ARK:${taskId}] downloading ${videoUrl.slice(0, 80)}...`);
    const localName = `ark-${taskId.slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.mp4`;
    const localPath = path_1.default.join(destDir, localName);
    const dl = await fetch(videoUrl);
    if (!dl.ok)
        throw new Error(`下载火山方舟视频失败 HTTP ${dl.status}`);
    fs_1.default.writeFileSync(localPath, Buffer.from(await dl.arrayBuffer()));
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIVideo][ARK:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    // 价格:Seedance 2.0 1080p 5s ≈ ¥0.65;fast 版 ≈ 一半
    const isFast = /fast/i.test(model);
    return { localPath, taskId, elapsedSec, costCny: isFast ? 0.35 : 0.65, usedModel: model };
}
// ─────────────────────────────────────────────────────────────────────────
// 单一云端 adapter(取代历史的 LingyaVideoAdapter)
// ─────────────────────────────────────────────────────────────────────────
class CloudVideoAdapter {
    name = '☁️ 云端视频';
    estimateCost(_duration) {
        return 0.5;
    }
    async generate(req, destDir) {
        fs_1.default.mkdirSync(destDir, { recursive: true });
        const cfg = await loadActiveVideoConfig();
        if (!cfg.ok) {
            if (cfg.reason === 'no-config') {
                throw new Error('云端未配置 video 类 API Key,请到 qianshanai.cn 网页端配置');
            }
            throw new Error(`云端 video key 取明文失败(网络异常,请稍后重试):${cfg.detail || ''}`);
        }
        if (cfg.providerCode === 'aliyun_dashscope') {
            return generateViaDashscope(cfg.apiKey, cfg.model, req, destDir);
        }
        if (cfg.providerCode === 'wuyinkeji') {
            return generateViaWuyinkejiGrokImagine(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        }
        if (cfg.providerCode === 'cool') {
            return generateViaCoolVideo(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        }
        if (cfg.providerCode === 'volcengine_ark') {
            // 火山方舟 Seedance — URL 写死,baseUrl 入参忽略
            return generateViaVolcengineArkVideo(cfg.apiKey, cfg.model, req, destDir);
        }
        return generateViaOpenAICompat(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
    }
}
class JimengCliVideoAdapter {
    name = '即梦 CLI';
    estimateCost(_duration) {
        return 0;
    }
    async generate(req, destDir) {
        fs_1.default.mkdirSync(destDir, { recursive: true });
        return (0, jimeng_cli_1.generateJimengCliTextVideo)(req, destDir, req.model);
    }
}
const adapters = {
    cloud: new CloudVideoAdapter(),
    // 老 'lingyaai' 标识也指向云端 adapter,兼容历史 callsite
    lingyaai: new CloudVideoAdapter(),
    jimeng_cli: new JimengCliVideoAdapter(),
};
function getAdapter(provider) {
    return adapters[normalizeVideoProvider(provider)];
}
function listProviders() {
    return [
        {
            id: 'cloud',
            name: '☁️ 云端视频(按用户在 qianshanai.cn 配置的 provider 走)',
            configured: true,
            costPerSec: 0.1,
            note: '用户云端 user_llm_config (video 类) 决定走灵芽中转还是百炼直连等',
        },
        {
            id: 'jimeng_cli',
            name: '即梦 CLI(本机登录)',
            configured: Boolean((0, jimeng_cli_1.findDreaminaExecutableSync)()),
            costPerSec: 0,
            note: '使用本机 dreamina CLI 纯文生视频,费用从用户即梦账号扣除',
        },
    ];
}
// ─────────────────────────────────────────────────────────────────────────
// 文件校验工具
// ─────────────────────────────────────────────────────────────────────────
function validateVideoFile(filePath, minDuration = 3) {
    if (!fs_1.default.existsSync(filePath))
        return { ok: false, error: '文件不存在' };
    const stat = fs_1.default.statSync(filePath);
    if (stat.size < 50_000)
        return { ok: false, error: `文件过小 ${stat.size} B(可能下载中断)` };
    try {
        const { execFileSync } = require('child_process');
        const { getFfprobePath } = require('../utils/binaries');
        const out = execFileSync(getFfprobePath(), [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-show_entries', 'stream=codec_type',
            '-of', 'json',
            filePath,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const json = JSON.parse(out);
        const duration = Number(json?.format?.duration) || 0;
        const streams = (json?.streams || []);
        const hasVideo = streams.some((s) => s.codec_type === 'video');
        const hasAudio = streams.some((s) => s.codec_type === 'audio');
        if (duration < minDuration) {
            return { ok: false, duration, error: `视频时长过短(${duration.toFixed(1)}s,期望 >=${minDuration}s)` };
        }
        if (!hasVideo)
            return { ok: false, duration, error: '没有视频流' };
        return { ok: true, duration, hasVideo, hasAudio };
    }
    catch (err) {
        return { ok: false, error: `ffprobe 失败:${String(err?.message || err)}` };
    }
}
// ─────────────────────────────────────────────────────────────────────────
// 批量生成 + 重试
// ─────────────────────────────────────────────────────────────────────────
const VIDEO_CONCURRENCY = {
    cloud: 3,
    lingyaai: 3,
    jimeng_cli: 1,
};
const rateLimitState = { throttled: false, throttleUntil: 0 };
async function generateBatch(provider, requests, destDir, onProgress) {
    const adapter = getAdapter(provider);
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const results = [];
    const baseConcurrency = VIDEO_CONCURRENCY[provider] || 1;
    const queue = [...requests];
    let nextIndex = 0;
    const runOne = async (req) => {
        onProgress?.(req.sceneIndex, 'start');
        let lastError;
        let finalResult;
        for (let attempt = 0; attempt < 2; attempt++) {
            if (rateLimitState.throttled && Date.now() < rateLimitState.throttleUntil) {
                const waitMs = rateLimitState.throttleUntil - Date.now();
                logger_1.logger.info(`[AIVideo] 限流降级,等 ${(waitMs / 1000).toFixed(0)}s`);
                await new Promise((r) => setTimeout(r, waitMs));
            }
            try {
                const result = await adapter.generate(req, destDir);
                const check = validateVideoFile(result.localPath, 3);
                if (!check.ok) {
                    logger_1.logger.warn(`[AIVideo] scene ${req.sceneIndex} quality fail: ${check.error}(${attempt + 1}/2)`);
                    lastError = check.error;
                    if (attempt === 0) {
                        onProgress?.(req.sceneIndex, 'retry', check.error);
                        try {
                            fs_1.default.unlinkSync(result.localPath);
                        }
                        catch { /* swallow */ }
                        continue;
                    }
                }
                else {
                    finalResult = result;
                    break;
                }
            }
            catch (err) {
                lastError = String(err?.message || err);
                if (/429|rate.?limit|too many|quota|配额|限流/i.test(lastError || '')) {
                    rateLimitState.throttled = true;
                    rateLimitState.throttleUntil = Date.now() + 30_000;
                    logger_1.logger.warn(`[AIVideo] 检测到限流,全局降速 30s: ${lastError}`);
                }
                const isUpstreamFailure = /上游不可用|Unable to process request|Internal Server Error|Bad Gateway/i.test(lastError || '');
                logger_1.logger.warn(`[AIVideo] scene ${req.sceneIndex} failed: ${lastError}(${attempt + 1}/2${isUpstreamFailure ? ', 不重试-上游故障' : ''})`);
                if (attempt === 0 && !isUpstreamFailure) {
                    onProgress?.(req.sceneIndex, 'retry', lastError);
                    continue;
                }
            }
        }
        if (finalResult) {
            results.push({ sceneIndex: req.sceneIndex, result: finalResult });
            onProgress?.(req.sceneIndex, 'done');
        }
        else {
            results.push({ sceneIndex: req.sceneIndex, error: lastError });
            onProgress?.(req.sceneIndex, 'fail', lastError);
        }
    };
    const workers = [];
    for (let w = 0; w < baseConcurrency; w++) {
        workers.push((async () => {
            while (true) {
                const idx = nextIndex++;
                if (idx >= queue.length)
                    break;
                await runOne(queue[idx]);
            }
        })());
    }
    await Promise.all(workers);
    rateLimitState.throttled = false;
    rateLimitState.throttleUntil = 0;
    return results;
}
async function regenerateOne(provider, req, destDir) {
    const adapter = getAdapter(provider);
    fs_1.default.mkdirSync(destDir, { recursive: true });
    return adapter.generate(req, destDir);
}
//# sourceMappingURL=ai-video-gen.js.map