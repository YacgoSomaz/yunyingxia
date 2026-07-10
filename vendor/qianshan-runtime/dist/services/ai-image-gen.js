"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_PROVIDERS_LEGACY = void 0;
exports.normalizeImageProvider = normalizeImageProvider;
exports.generateImage = generateImage;
exports.hasAnyImageProvider = hasAnyImageProvider;
exports.pickAvailableImageProvider = pickAvailableImageProvider;
exports.listImageProviders = listImageProviders;
// ══════════════════════════════════════════════════════════════════════
//  AI 图片生成 — 完全云端化版本
//
//  入口:generateImage(req, destDir)
//    1. llmTierConfig.resolveCategory('image') 拿用户云端的 image 配置
//       → { providerCode, baseUrl, apiKey/model } (apiKey 由 cloud-llm-config 解密)
//    2. 按 providerCode 分协议分发:
//       - 'aliyun_dashscope' → 百炼 image-synthesis async API
//       - 其它 (lingya/wuyinkeji/cool/bltcy/geek/ ...) → OpenAI-compat /v1/images/generations
//
//  桌面端不再保留任何 provider 自己的 adapter class 或本地 fallback,
//  baseUrl/apiKey/model 全部以云端 user_llm_config 那条记录为准。
// ══════════════════════════════════════════════════════════════════════
const llm_tier_config_1 = require("./llm-tier-config");
const cloud_llm_config_1 = require("./cloud-llm-config");
const logger_1 = require("../utils/logger");
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
exports.IMAGE_PROVIDERS_LEGACY = [
    'jimeng',
    'siliconflow',
    'siliconflow-kolors',
    'lingyaai',
];
function normalizeImageProvider(_input) {
    return 'cloud';
}
// ─────────────────────────────────────────────────────────────────────────
// 辅助
// ─────────────────────────────────────────────────────────────────────────
/**
 * 下载图片到本地。
 *
 * **关键设计:用 Electron 的 net.fetch,不用 Node 内置的 undici fetch**
 *   - net.fetch 走 Chrome 网络栈,跟浏览器同款 DNS / 系统代理 / TLS / HTTP2 协商
 *   - 实测:undici 对某些国内中转 CDN(如 openpt.wuyinkeji.com)会 fetch failed,
 *     但浏览器能正常打开 —— 网络栈差异导致,改 net.fetch 就好
 *
 * 带 3 次重试扛临时抖动,单次 60s 超时。
 */
async function downloadToFile(url, destPath) {
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    // electronNet.fetch 在 Electron 28+ 可用,签名和原生 fetch 兼容
    const doFetch = electron_1.net?.fetch ? electron_1.net.fetch.bind(electron_1.net) : fetch;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const res = await doFetch(url, { signal: AbortSignal.timeout(60000) });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 1024)
                throw new Error(`内容过小 ${buf.length}B,疑似失败响应`);
            fs_1.default.writeFileSync(destPath, buf);
            if (attempt > 1) {
                logger_1.logger.info(`[AIImage] download ok on attempt ${attempt}/${MAX_ATTEMPTS}`);
            }
            return;
        }
        catch (err) {
            lastErr = err;
            const msg = String(err?.message || err);
            if (attempt < MAX_ATTEMPTS) {
                const waitMs = 2000 * attempt; // 2s, 4s
                logger_1.logger.warn(`[AIImage] download fail attempt ${attempt}/${MAX_ATTEMPTS} (${msg.slice(0, 80)}),${(waitMs / 1000)}s 后重试`);
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
            }
        }
    }
    throw new Error(`图片下载网络异常 url=${url.slice(0, 80)}... err=${String(lastErr?.message || lastErr)} (重试 ${MAX_ATTEMPTS} 次都失败)`);
}
/**
 * OpenAI-compat baseUrl 归一化(只对 OpenAI-compat 渠道做):
 *   - 灵芽配的 baseUrl 通常已经带 /v1(`https://api.lingyaai.cn/v1`)→ 不动
 *   - geek 等可能只配根域名 → 自动补 /v1
 *   - 速创(wuyinkeji)/柏拉图(bltcy)/Cool 是私有 async 协议,**绝不**走这个归一化
 */
function normalizeOpenAICompatBaseUrl(baseUrl) {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (/\/v\d+$/.test(trimmed))
        return trimmed;
    return `${trimmed}/v1`;
}
/** 哪些 providerCode 走私有 async 协议(自己拼路径,baseUrl 不补 /v1) */
const PRIVATE_ASYNC_PROVIDERS = new Set(['wuyinkeji', 'bltcy', 'cool']);
/** bltcy/cool 实际接口都用 /v1/...,但用户填的 baseUrl 可能带也可能不带 /v1。
 *  这个工具:拿到一个 baseUrl,去掉末尾 / 和末尾 /v1,返回干净的根。
 *  代码里再统一拼 /v1/xxx。
 */
function stripV1Suffix(baseUrl) {
    let trimmed = baseUrl.replace(/\/+$/, '');
    if (trimmed.endsWith('/v1'))
        trimmed = trimmed.slice(0, -3);
    return trimmed;
}
/**
 * 取云端 image 配置的当前选中条。
 *
 * 返回值含义:
 *   - 'no-config' : 用户云端确实没配 image 类配置 → UI 提示去网页配
 *   - 'no-key'    : 配置存在但 decrypt-key 调用失败(通常网络抖动或 token 过期)→ UI 提示稍后重试
 */
async function loadActiveImageConfig() {
    const r = await llm_tier_config_1.llmTierConfig.resolveCategory('image');
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
    const trimmed = r.baseUrl.replace(/\/+$/, '');
    const baseUrl = PRIVATE_ASYNC_PROVIDERS.has(r.providerCode)
        ? trimmed
        : normalizeOpenAICompatBaseUrl(trimmed);
    return {
        ok: true,
        providerCode: r.providerCode,
        baseUrl,
        apiKey,
        model: r.model,
    };
}
// ─────────────────────────────────────────────────────────────────────────
// OpenAI-compat 分支(lingya/wuyinkeji/cool/bltcy/geek/...)
// ─────────────────────────────────────────────────────────────────────────
/** 按 model + aspect 算 size 字符串(主要 model 都覆盖) */
function buildOpenAICompatSize(model, aspect) {
    // seedream-5.0 要求总像素 ≥3686400
    if (/seedream/i.test(model)) {
        if (aspect === '9:16')
            return '1536x2688';
        if (aspect === '16:9')
            return '2688x1536';
        return '2048x2048';
    }
    // z-image-turbo 范围 [512*512, 2048*2048]
    if (/z-image/i.test(model)) {
        if (aspect === '9:16')
            return '720x1280';
        if (aspect === '16:9')
            return '1280x720';
        return '1024x1024';
    }
    // gpt-image-1 / gpt-image-2 (OpenAI):宽高必须 16 倍数
    if (/gpt-image/i.test(model)) {
        if (aspect === '9:16')
            return '1024x1536';
        if (aspect === '16:9')
            return '1536x1024';
        return '1024x1024';
    }
    // 兜底
    if (aspect === '9:16')
        return '1080x1920';
    if (aspect === '16:9')
        return '1920x1080';
    return '1024x1024';
}
/** nano-banana / gemini-image 这类走 chat/completions 内嵌 markdown 图片链接 */
function getImageModelKind(model) {
    if (/nano-banana/i.test(model))
        return 'chat-md';
    return 'images-api';
}
async function generateViaOpenAICompat(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const basePrompt = req.promptCN || req.promptEN;
    const kind = getImageModelKind(model);
    const localName = `img-${Date.now()}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    if (kind === 'chat-md') {
        const aspectHint = req.aspect === '9:16' ? ', aspect ratio 9:16, vertical portrait orientation'
            : req.aspect === '16:9' ? ', aspect ratio 16:9, horizontal landscape orientation'
                : ', aspect ratio 1:1, square format';
        logger_1.logger.info(`[AIImage][${model}] chat-md: "${basePrompt.slice(0, 80)}..." aspect=${req.aspect}`);
        const r = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: basePrompt + aspectHint }] }),
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
            throw new Error(`图片生成失败(${model}):HTTP ${r.status} ${snippet}`);
        }
        const content = json?.choices?.[0]?.message?.content || '';
        const urlMatch = content.match(/\((https?:[^)]+)\)/);
        const dataMatch = content.match(/\(data:image\/(\w+);base64,([^)]+)\)/);
        if (urlMatch)
            await downloadToFile(urlMatch[1], localPath);
        else if (dataMatch)
            fs_1.default.writeFileSync(localPath, Buffer.from(dataMatch[2], 'base64'));
        else
            throw new Error(`图片返回未找到图片(${model}):${content.slice(0, 200)}`);
        return { localPath, provider: 'cloud', costCny: 0.22, elapsedSec: (Date.now() - startMs) / 1000 };
    }
    // images-api 分支
    const size = buildOpenAICompatSize(model, req.aspect);
    let promptForApi = basePrompt;
    if (/gpt-image/i.test(model)) {
        const aspectHint = req.aspect === '9:16' ? ', vertical 9:16 portrait composition, full body shot'
            : req.aspect === '16:9' ? ', horizontal 16:9 landscape composition, wide shot'
                : ', square 1:1 composition';
        promptForApi = basePrompt + aspectHint;
    }
    // 完整 URL 也打出来,方便排查云端某些 provider baseUrl 拼接问题
    const fullUrl = `${baseUrl}/images/generations`;
    logger_1.logger.info(`[AIImage][${model}] POST ${fullUrl} size=${size}`);
    const body = { model, prompt: promptForApi, n: 1, size, response_format: 'url' };
    const MAX_ATTEMPTS = 2;
    let lastErr = '';
    let json = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const res = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
            lastErr = `返回非 JSON(HTTP ${res.status}):${snippet || '空响应'}`;
        }
        if (res.ok && parsed) {
            json = parsed;
            break;
        }
        if (res.status >= 400 && res.status < 500) {
            const msg = parsed?.error?.message || parsed?.message || lastErr || `HTTP ${res.status}`;
            throw new Error(`图片生成失败(${model}):${msg}`);
        }
        if (!lastErr)
            lastErr = parsed?.error?.message || parsed?.message || `HTTP ${res.status}`;
        if (attempt < MAX_ATTEMPTS) {
            logger_1.logger.warn(`[AIImage][${model}] attempt ${attempt}/${MAX_ATTEMPTS} 失败(${lastErr.slice(0, 80)}),2s 后重试`);
            await new Promise((r) => setTimeout(r, 2000));
            continue;
        }
        throw new Error(`图片生成失败(${model}):${lastErr}`);
    }
    if (!json)
        throw new Error(`图片生成失败(${model}):${lastErr}`);
    const imgUrl = json?.data?.[0]?.url || '';
    const b64 = json?.data?.[0]?.b64_json || '';
    if (!imgUrl && !b64)
        throw new Error('图片返回结构异常,未找到 url/b64_json');
    if (imgUrl)
        await downloadToFile(imgUrl, localPath);
    else
        fs_1.default.writeFileSync(localPath, Buffer.from(b64, 'base64'));
    return { localPath, provider: 'cloud', costCny: 0.22, elapsedSec: (Date.now() - startMs) / 1000 };
}
// ─────────────────────────────────────────────────────────────────────────
// 火山方舟 ARK Seedream (volcengine) 同步分支 — OpenAI-compat 体接近但端点固定 + size 特殊
//
// 协议要点:
//   - 端点: POST https://ark.cn-beijing.volces.com/api/v3/images/generations(**写死**)
//   - Auth: `Authorization: Bearer ${apiKey}`(ARK API key)
//   - Body 跟 OpenAI 接近但加了 watermark / seed / guidance_scale
//   - Seedream 5.0 size 只支持 2K/3K(不支持 1024x1024)
//     · 1:1   → 2048x2048
//     · 9:16  → 1632x2752(纵向 2K)
//     · 16:9  → 2752x1632(横向 2K)
//   - response_format='url'(返回 24h CDN URL,我们立即下载到本地)
//   - 默认 watermark=true,我们设 false 去掉
// ─────────────────────────────────────────────────────────────────────────
const VOLC_ARK_IMAGE_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
/** ARK Seedream size 映射 — 官方文档(82379/1541523)推荐的 2K 规格像素值
 *  文档表格里 9:16 / 16:9 / 1:1 的 2K 像素值(其他档位还有 3K/4K,这里取 2K 性价比最好)*/
function buildArkSize(aspect) {
    if (aspect === '9:16')
        return '1600x2848';
    if (aspect === '16:9')
        return '2848x1600';
    return '2048x2048'; // 1:1
}
async function generateViaVolcengineArk(_baseUrl, // ARK URL 固定写死,云端 baseUrl 忽略
apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const prompt = req.promptCN || req.promptEN;
    const size = buildArkSize(req.aspect);
    const localName = `img-${Date.now()}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    // Body 字段严格按官方文档(82379/1541523)只传必要+明确支持的:
    //   - guidance_scale: 5.0/4.5/4.0 明确不支持 → 不传
    //   - negative_prompt: 文档里无此字段 → 不传
    //   - n: 文档无此字段(组图用 sequential_image_generation) → 不传
    //   - response_format: 'url' 默认值,显式传保险
    //   - watermark: 默认 true,设 false 去水印
    //   - seed: 默认 -1,3.0-t2i 明示支持,5.0 没明说"不支持",保留传 -1 无副作用
    const body = {
        model,
        prompt,
        size,
        response_format: 'url',
        watermark: false,
        seed: -1,
    };
    logger_1.logger.info(`[AIImage][ARK Seedream] POST ${VOLC_ARK_IMAGE_URL} model=${model} size=${size}`);
    const MAX_ATTEMPTS = 2;
    let lastErr = '';
    let json = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const res = await fetch(VOLC_ARK_IMAGE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let parsed = null;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
            lastErr = `返回非 JSON(HTTP ${res.status}):${snippet || '空响应'}`;
        }
        if (res.ok && parsed) {
            json = parsed;
            break;
        }
        if (res.status >= 400 && res.status < 500) {
            const msg = parsed?.error?.message || parsed?.message || lastErr || `HTTP ${res.status}`;
            throw new Error(`图片生成失败(ARK Seedream ${model}):${msg}`);
        }
        if (!lastErr)
            lastErr = parsed?.error?.message || parsed?.message || `HTTP ${res.status}`;
        if (attempt < MAX_ATTEMPTS) {
            logger_1.logger.warn(`[AIImage][ARK Seedream] attempt ${attempt}/${MAX_ATTEMPTS} 失败(${lastErr.slice(0, 80)}),2s 后重试`);
            await new Promise((r) => setTimeout(r, 2000));
            continue;
        }
        throw new Error(`图片生成失败(ARK Seedream ${model}):${lastErr}`);
    }
    if (!json)
        throw new Error(`图片生成失败(ARK Seedream ${model}):${lastErr}`);
    const imgUrl = json?.data?.[0]?.url || '';
    const b64 = json?.data?.[0]?.b64_json || '';
    if (!imgUrl && !b64)
        throw new Error('ARK Seedream 返回结构异常,未找到 url/b64_json');
    // URL 24h 过期,必须立即下载
    if (imgUrl)
        await downloadToFile(imgUrl, localPath);
    else
        fs_1.default.writeFileSync(localPath, Buffer.from(b64, 'base64'));
    // 价格估算(5.0 @ 2K ≈ ¥0.07/张,设个保守值)
    return { localPath, provider: 'cloud', costCny: 0.1, elapsedSec: (Date.now() - startMs) / 1000 };
}
// ─────────────────────────────────────────────────────────────────────────
// 速创(wuyinkeji) 异步任务分支 — 私有协议(协议来源:qianshanai StoryboardImageGenService.callWuyinkejiAsync)
//
// 协议要点:
//   - 提交: POST  {baseUrl}/api/async/image_gpt
//   - 轮询: GET   {baseUrl}/api/async/detail?id={taskId}&key={apiKey}
//   - Authorization 头: 直传 apiKey, **不带 Bearer 前缀**
//   - body: { prompt, size: '9:16'|'16:9'|'1:1', urls?: string[] (参考图,最多 14) }
//   - 响应 status: 0/1=进行中, 2=成功(result[0] 是 URL), 3=失败
// ─────────────────────────────────────────────────────────────────────────
async function generateViaWuyinkeji(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const basePrompt = req.promptCN || req.promptEN;
    const submitUrl = `${baseUrl}/api/async/image_gpt`;
    const detailUrl = `${baseUrl}/api/async/detail`;
    logger_1.logger.info(`[AIImage][wuyinkeji:${model}] POST ${submitUrl} aspect=${req.aspect}`);
    // ① 提交
    let submitRes;
    try {
        submitRes = await fetch(submitUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: apiKey, // 注意:速创不带 Bearer
            },
            body: JSON.stringify({ prompt: basePrompt, size: req.aspect }),
            signal: AbortSignal.timeout(30000),
        });
    }
    catch (err) {
        throw new Error(`速创提交网络异常: ${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        logger_1.logger.warn(`[AIImage][wuyinkeji] submit HTTP ${submitRes.status}: ${submitText.slice(0, 300)}`);
        throw new Error(`速创提交失败 HTTP ${submitRes.status}: ${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`速创提交响应非 JSON: ${submitText.slice(0, 200)}`);
    }
    const code = submitJson?.code;
    if (code !== 0 && code !== 200) {
        throw new Error(`速创提交业务码异常 code=${code} msg=${submitJson?.msg || ''}`);
    }
    // 速创实际响应:{"code":200,"msg":"成功","data":{"id":"image_xxx"}}
    // task_id 在 data.id;同时兼容 data.task_id / 顶层 task_id / 顶层 id
    const taskId = submitJson?.data?.id ||
        submitJson?.data?.task_id ||
        submitJson?.task_id ||
        submitJson?.id;
    if (!taskId) {
        throw new Error(`速创提交未返回 task_id: ${submitText.slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIImage][wuyinkeji:${model}] task submitted: task_id=${taskId}`);
    // ② 轮询(最多 240s,初始 sleep=1500ms,每次 +500ms 直到 3500ms)
    // 速创 detail 响应结构不固定,status / result 可能在 data 下也可能更深,
    // 用正则在整个 body 文本里搜 status / result,跟 qianshanai java 实现保持一致。
    const deadline = Date.now() + 240_000;
    let sleepMs = 1500;
    let lastStatus = -1;
    let lastLoggedAt = 0;
    let imageUrl = '';
    let firstPollLogged = false;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, sleepMs));
        if (sleepMs < 3500)
            sleepMs += 500;
        let pollRes;
        try {
            pollRes = await fetch(`${detailUrl}?id=${taskId}&key=${encodeURIComponent(apiKey)}`, {
                signal: AbortSignal.timeout(15000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIImage][wuyinkeji:${taskId}] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        if (!pollRes.ok)
            continue;
        const pollText = await pollRes.text();
        // 第一次成功的 poll 把 raw body 打出来(截断 600 字符),方便定位结构问题
        if (!firstPollLogged) {
            logger_1.logger.info(`[AIImage][wuyinkeji:${taskId}] first poll body=${pollText.slice(0, 600)}`);
            firstPollLogged = true;
        }
        // 业务码:外层 code 不是 0/200 → 跳过
        const codeMatch = pollText.match(/"code"\s*:\s*(\d+)/);
        if (codeMatch) {
            const c = parseInt(codeMatch[1], 10);
            if (c !== 0 && c !== 200)
                continue;
        }
        // status:在整段 body 里搜 "status":N(可能嵌在 data.status / data.task.status 等)
        const statusMatch = pollText.match(/"status"\s*:\s*(-?\d+)/);
        if (!statusMatch)
            continue;
        const status = parseInt(statusMatch[1], 10);
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[AIImage][wuyinkeji:${taskId}] status=${status} elapsed=${((Date.now() - startMs) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 2) {
            // result 数组第一项 URL — 跨层级正则
            const urlMatch = pollText.match(/"result"\s*:\s*\[\s*"(https?:\/\/[^"]+)"/);
            if (urlMatch) {
                imageUrl = urlMatch[1];
                break;
            }
            // 兜底:任意 https URL 字符串
            const anyUrl = pollText.match(/"(https?:\/\/[^"]+\.(?:png|jpe?g|webp))"/i);
            if (anyUrl) {
                imageUrl = anyUrl[1];
                break;
            }
            throw new Error(`速创 status=2 但 result 为空: ${pollText.slice(0, 300)}`);
        }
        if (status === 3) {
            const msg = pollText.match(/"message"\s*:\s*"([^"]*)"/)?.[1] ||
                pollText.match(/"fail_reason"\s*:\s*"([^"]*)"/)?.[1] ||
                '未知';
            throw new Error(`速创任务失败: ${msg}`);
        }
        // 0/1 继续轮询
    }
    if (!imageUrl)
        throw new Error(`速创出图超时(240s, last_status=${lastStatus})`);
    // ③ 下载
    logger_1.logger.info(`[AIImage][wuyinkeji:${taskId}] downloading ${imageUrl}`);
    const localName = `wyk-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    await downloadToFile(imageUrl, localPath);
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIImage][wuyinkeji:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return { localPath, provider: 'cloud', costCny: 0.3, elapsedSec };
}
// ─────────────────────────────────────────────────────────────────────────
// 柏拉图(bltcy) 异步任务分支 — 协议来源:qianshanai callBltcyAsync
//
// 提交: POST {base}/v1/images/generations?async=true (JSON, Bearer)
// 轮询: GET  {base}/v1/images/tasks/{taskId}        (Bearer)
// 状态: SUCCESS / FAILURE / NOT_START / IN_PROGRESS
// 结果: data.data.data[0].url 或 .b64_json
// 总超时 480s,初始 1s 轮询,10s 后 5s 轮询
// ─────────────────────────────────────────────────────────────────────────
async function generateViaBltcy(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const basePrompt = req.promptCN || req.promptEN;
    const cleanBase = stripV1Suffix(baseUrl);
    const submitUrl = `${cleanBase}/v1/images/generations?async=true`;
    const tasksBase = `${cleanBase}/v1/images/tasks/`;
    // bltcy size 跟 aspect 对齐,3840x2160 / 2160x3840 / 2048x2048
    const sizeMap = {
        '16:9': '3840x2160',
        '9:16': '2160x3840',
        '1:1': '2048x2048',
    };
    const size = sizeMap[req.aspect] || '3840x2160';
    logger_1.logger.info(`[AIImage][bltcy:${model}] POST ${submitUrl} size=${size}`);
    // ① 提交
    let submitRes;
    try {
        submitRes = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, prompt: basePrompt, size, n: 1 }),
            signal: AbortSignal.timeout(60000),
        });
    }
    catch (err) {
        throw new Error(`柏拉图提交网络异常: ${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        throw new Error(`柏拉图提交失败 HTTP ${submitRes.status}: ${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`柏拉图提交响应非 JSON: ${submitText.slice(0, 200)}`);
    }
    const taskId = submitJson?.task_id || submitJson?.data?.task_id;
    if (!taskId) {
        throw new Error(`柏拉图提交未返回 task_id: ${submitText.slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIImage][bltcy:${model}] task submitted: task_id=${taskId}`);
    // ② 轮询(总超时 480s,前 10s 内 1s/次,之后 5s/次)
    const deadline = Date.now() + 480_000;
    let sleepMs = 1000;
    let elapsed = 0;
    let lastStatus = '';
    let lastLoggedAt = 0;
    let imageUrl = '';
    let firstPollLogged = false;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, sleepMs));
        elapsed += sleepMs;
        if (elapsed >= 10000)
            sleepMs = 5000;
        let pollRes;
        try {
            pollRes = await fetch(`${tasksBase}${taskId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(20000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIImage][bltcy:${taskId}] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        if (!pollRes.ok)
            continue;
        const pollText = await pollRes.text();
        if (!firstPollLogged) {
            logger_1.logger.info(`[AIImage][bltcy:${taskId}] first poll body=${pollText.slice(0, 600)}`);
            firstPollLogged = true;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            continue;
        }
        const taskNode = pollJson?.data || {};
        const status = String(taskNode?.status || '').toUpperCase();
        if (!status)
            continue;
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[AIImage][bltcy:${taskId}] status=${status} elapsed=${((Date.now() - startMs) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 'SUCCESS') {
            // data.data.data[0]
            const arr = taskNode?.data?.data;
            if (Array.isArray(arr) && arr.length > 0) {
                const first = arr[0];
                if (first?.url) {
                    imageUrl = first.url;
                    break;
                }
                if (first?.b64_json) {
                    // 内联 base64 直接写盘
                    const localName = `bltcy-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
                    const localPath = path_1.default.join(destDir, localName);
                    fs_1.default.writeFileSync(localPath, Buffer.from(first.b64_json, 'base64'));
                    const elapsedSec = (Date.now() - startMs) / 1000;
                    logger_1.logger.info(`[AIImage][bltcy:${taskId}] done(b64) elapsed=${elapsedSec.toFixed(1)}s`);
                    return { localPath, provider: 'cloud', costCny: 0.4, elapsedSec };
                }
            }
            throw new Error(`柏拉图 SUCCESS 但响应无 url/b64_json: ${pollText.slice(0, 300)}`);
        }
        if (status === 'FAILURE') {
            const reason = taskNode?.fail_reason || taskNode?.message || '未知';
            throw new Error(`柏拉图任务失败: ${reason}`);
        }
        // NOT_START / IN_PROGRESS 继续轮询
    }
    if (!imageUrl)
        throw new Error(`柏拉图出图超时(480s, last_status=${lastStatus})`);
    // ③ 下载
    logger_1.logger.info(`[AIImage][bltcy:${taskId}] downloading ${imageUrl}`);
    const localName = `bltcy-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    await downloadToFile(imageUrl, localPath);
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIImage][bltcy:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return { localPath, provider: 'cloud', costCny: 0.4, elapsedSec };
}
// ─────────────────────────────────────────────────────────────────────────
// Cool 网关(coolapis / mjapi.cc.cd) 异步任务分支 — 协议来源:qianshanai callCoolAsync
//
// 提交: POST {base}/v1/cool/generate
//        body: { prompt, model, ratio: "16:9"/"9:16"/"1:1", files?:[{url,type:"image"}] }
// 轮询: GET  {base}/v1/cool/task/{taskId}
// 状态: pending / running / success / failed
// 结果: result.url
// 总超时 500s,3s 一次轮询
// ─────────────────────────────────────────────────────────────────────────
async function generateViaCool(baseUrl, apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const basePrompt = req.promptCN || req.promptEN;
    const cleanBase = stripV1Suffix(baseUrl);
    const submitUrl = `${cleanBase}/v1/cool/generate`;
    const tasksBase = `${cleanBase}/v1/cool/task/`;
    logger_1.logger.info(`[AIImage][cool:${model}] POST ${submitUrl} ratio=${req.aspect}`);
    // ① 提交
    let submitRes;
    try {
        submitRes = await fetch(submitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ prompt: basePrompt, model, ratio: req.aspect }),
            signal: AbortSignal.timeout(60000),
        });
    }
    catch (err) {
        throw new Error(`Cool 提交网络异常: ${String(err?.message || err)}`);
    }
    const submitText = await submitRes.text();
    if (!submitRes.ok) {
        throw new Error(`Cool 提交失败 HTTP ${submitRes.status}: ${submitText.slice(0, 200)}`);
    }
    let submitJson;
    try {
        submitJson = JSON.parse(submitText);
    }
    catch {
        throw new Error(`Cool 提交响应非 JSON: ${submitText.slice(0, 200)}`);
    }
    const taskId = submitJson?.task_id || submitJson?.data?.task_id;
    if (!taskId) {
        throw new Error(`Cool 提交未返回 task_id: ${submitText.slice(0, 200)}`);
    }
    logger_1.logger.info(`[AIImage][cool:${model}] task submitted: task_id=${taskId}`);
    // ② 轮询(总超时 500s,3s 一次)
    const deadline = Date.now() + 500_000;
    const POLL_INTERVAL = 3000;
    let lastStatus = '';
    let lastLoggedAt = 0;
    let imageUrl = '';
    let firstPollLogged = false;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        let pollRes;
        try {
            pollRes = await fetch(`${tasksBase}${taskId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal: AbortSignal.timeout(20000),
            });
        }
        catch (err) {
            logger_1.logger.warn(`[AIImage][cool:${taskId}] poll network err: ${String(err?.message || err)}`);
            continue;
        }
        if (!pollRes.ok)
            continue;
        const pollText = await pollRes.text();
        if (!firstPollLogged) {
            logger_1.logger.info(`[AIImage][cool:${taskId}] first poll body=${pollText.slice(0, 600)}`);
            firstPollLogged = true;
        }
        let pollJson;
        try {
            pollJson = JSON.parse(pollText);
        }
        catch {
            continue;
        }
        const status = String(pollJson?.status || '').toLowerCase();
        if (!status)
            continue;
        if (status !== lastStatus || Date.now() - lastLoggedAt > 30000) {
            logger_1.logger.info(`[AIImage][cool:${taskId}] status=${status} elapsed=${((Date.now() - startMs) / 1000).toFixed(0)}s`);
            lastStatus = status;
            lastLoggedAt = Date.now();
        }
        if (status === 'success') {
            imageUrl = pollJson?.result?.url || '';
            if (imageUrl)
                break;
            throw new Error(`Cool SUCCESS 但 result.url 为空: ${pollText.slice(0, 300)}`);
        }
        if (status === 'failed') {
            const err = pollJson?.error || '未知错误';
            throw new Error(`Cool 任务失败: ${err}`);
        }
        // pending / running 继续轮询
    }
    if (!imageUrl)
        throw new Error(`Cool 出图超时(500s, last_status=${lastStatus})`);
    // ③ 下载
    logger_1.logger.info(`[AIImage][cool:${taskId}] downloading ${imageUrl}`);
    const localName = `cool-${String(taskId).slice(-12)}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    await downloadToFile(imageUrl, localPath);
    const elapsedSec = (Date.now() - startMs) / 1000;
    logger_1.logger.info(`[AIImage][cool:${taskId}] done elapsed=${elapsedSec.toFixed(1)}s file=${localPath}`);
    return { localPath, provider: 'cloud', costCny: 0.4, elapsedSec };
}
// ─────────────────────────────────────────────────────────────────────────
// 阿里云百炼 image-synthesis async 分支
// ─────────────────────────────────────────────────────────────────────────
async function generateViaDashscope(apiKey, model, req, destDir) {
    const startMs = Date.now();
    fs_1.default.mkdirSync(destDir, { recursive: true });
    const basePrompt = req.promptCN || req.promptEN;
    const sizeMap = {
        '9:16': '720*1280',
        '16:9': '1280*720',
        '1:1': '1024*1024',
    };
    const size = sizeMap[req.aspect] || '1024*1024';
    logger_1.logger.info(`[AIImage][dashscope:${model}] async: "${basePrompt.slice(0, 80)}..." size=${size}`);
    // ① 提交任务
    const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
            model,
            input: { prompt: basePrompt, negative_prompt: req.negativePrompt },
            parameters: { size, n: 1 },
        }),
    });
    if (!submitRes.ok) {
        throw new Error(`百炼图片提交失败 HTTP ${submitRes.status}:${(await submitRes.text()).slice(0, 200)}`);
    }
    const submitJson = (await submitRes.json());
    const taskId = submitJson?.output?.task_id;
    if (!taskId)
        throw new Error(`百炼图片提交未返回 task_id:${JSON.stringify(submitJson).slice(0, 200)}`);
    // ② 轮询(最多 60s,每 3s 一次)
    let imgUrl = '';
    for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!pollRes.ok)
            continue;
        const pollJson = (await pollRes.json());
        const status = pollJson?.output?.task_status;
        if (status === 'SUCCEEDED') {
            imgUrl = pollJson?.output?.results?.[0]?.url || '';
            break;
        }
        if (status === 'FAILED') {
            throw new Error(`百炼图片任务失败:${pollJson?.output?.message || '未知原因'}`);
        }
    }
    if (!imgUrl)
        throw new Error('百炼图片轮询超时');
    const localName = `dash-${Date.now()}-${crypto_1.default.randomBytes(3).toString('hex')}.png`;
    const localPath = path_1.default.join(destDir, localName);
    await downloadToFile(imgUrl, localPath);
    return { localPath, provider: 'cloud', costCny: 0.5, elapsedSec: (Date.now() - startMs) / 1000 };
}
// ─────────────────────────────────────────────────────────────────────────
// 主入口
// ─────────────────────────────────────────────────────────────────────────
/** 单张生成 — 按云端 providerCode 分发到对应协议 */
async function generateImage(req, destDir, _preferred) {
    const cfg = await loadActiveImageConfig();
    if (!cfg.ok) {
        if (cfg.reason === 'no-config') {
            throw new Error('云端未配置 image 类 API Key,请到 qianshanai.cn 网页端配置');
        }
        // no-key: 配置存在,但解密 key 拿不到 — 通常是网络抖动 / token 过期
        throw new Error(`云端 image key 取明文失败(网络异常,请稍后重试):${cfg.detail || ''}`);
    }
    switch (cfg.providerCode) {
        case 'aliyun_dashscope':
            return generateViaDashscope(cfg.apiKey, cfg.model, req, destDir);
        case 'volcengine':
            // 火山 ARK Seedream — URL 写死,baseUrl 入参忽略
            return generateViaVolcengineArk(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        case 'wuyinkeji':
            return generateViaWuyinkeji(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        case 'bltcy':
            return generateViaBltcy(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        case 'cool':
            return generateViaCool(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
        // 默认 OpenAI-compat (lingya / geek / openai / 任何标准 OpenAI 兼容渠道)
        default:
            return generateViaOpenAICompat(cfg.baseUrl, cfg.apiKey, cfg.model, req, destDir);
    }
}
/** 是否有可用的图像生成能力(给 one-click 决定要不要走 ai-image 分支) */
function hasAnyImageProvider() {
    // 真假在 generate 时查云端;这里恒 true,失败由 generate 抛错由上层降级到素材库
    return true;
}
/** 老 API 兼容:给 one-click 拿一个稳定的 provider id */
function pickAvailableImageProvider() {
    return 'cloud';
}
/** 列 provider 状态(给前端 / Settings 用) */
function listImageProviders() {
    return [
        {
            id: 'cloud',
            name: '☁️ 云端图像(按用户在 qianshanai.cn 配置的 provider 走)',
            configured: true,
            costPerImage: 0.22,
            note: '具体走哪条 + 用什么 model 由用户云端 user_llm_config (image 类)决定',
        },
    ];
}
// ═══════════════ 已退役的导出(给老调用方兼容) ═══════════════
// getImageAdapter / 单 adapter class 等接口随云端化全部退役;若有外部模块仍依赖,
// 升级时改成调 generateImage(req, destDir) 即可。
//# sourceMappingURL=ai-image-gen.js.map