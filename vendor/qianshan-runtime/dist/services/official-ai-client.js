"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.officialAiClient = exports.OfficialAIClient = void 0;
const electron_1 = require("electron");
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const PRODUCT_ID = 'operation_shrimp';
const ENTITLEMENT = 'operation_course';
const ANALYSIS_TASK_TYPE = 'operation_analysis';
const IMAGE_TASK_TYPE = 'operation_image';
const ACCOUNT_BASE_URL = 'https://anyq.site';
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS = 180000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function safeJson(value) {
    if (!value || typeof value !== 'object')
        return {};
    return value;
}
function safeArray(value) {
    return Array.isArray(value) ? value : [];
}
function firstObject(...values) {
    for (const value of values) {
        const object = safeJson(value);
        if (Object.keys(object).length)
            return object;
    }
    return {};
}
function firstValue(...values) {
    for (const value of values) {
        if (value !== null && typeof value !== 'undefined')
            return value;
    }
    return null;
}
function isExplicitFalse(value) {
    return value === false || value === 0 || value === '0' || /^false|disabled|closed$/i.test(String(value || ''));
}
function hasAnyMeaningfulField(value) {
    return Object.keys(safeJson(value)).length > 0;
}
function normalizeTaskMap(...values) {
    const mapped = {};
    for (const value of values) {
        if (!value)
            continue;
        if (Array.isArray(value)) {
            for (const task of value) {
                const object = safeJson(task);
                const id = String(task.task_type || task.taskType || task.type || task.id || task.name || '').trim();
                if (id)
                    mapped[id] = object;
            }
            continue;
        }
        const object = safeJson(value);
        for (const [key, task] of Object.entries(object)) {
            mapped[key] = safeJson(task);
        }
    }
    return mapped;
}
function taskFromCatalog(taskMap, taskType, ...fallbacks) {
    if (taskMap[taskType])
        return taskMap[taskType];
    const camelTaskType = taskType.replace(/_([a-z])/g, (_, ch) => String(ch).toUpperCase());
    if (taskMap[camelTaskType])
        return taskMap[camelTaskType];
    for (const task of Object.values(taskMap)) {
        const object = safeJson(task);
        const id = String(object.task_type || object.taskType || object.type || object.id || object.name || '').trim();
        if (id === taskType || id === camelTaskType)
            return object;
    }
    const availableTasks = fallbacks
        .flatMap((object) => safeArray(safeJson(object).available_tasks || safeJson(object).availableTasks || safeJson(object).task_types || safeJson(object).taskTypes))
        .map((item) => String(typeof item === 'string' ? item : item?.task_type || item?.taskType || item?.type || item?.id || item?.name || '').trim());
    if (availableTasks.includes(taskType) || availableTasks.includes(camelTaskType))
        return { task_type: taskType, configured: true, available: true };
    for (const object of fallbacks.map(safeJson)) {
        if (object[taskType])
            return object[taskType];
        if (object[camelTaskType])
            return object[camelTaskType];
    }
    return {};
}
function normalizeTaskAvailability(task, fallbackConfigured) {
    const object = safeJson(task);
    const present = hasAnyMeaningfulField(object);
    const configured = !isExplicitFalse(object.configured) && (object.configured === true || object.available === true || object.enabled === true || present || fallbackConfigured);
    const available = configured && !isExplicitFalse(object.available) && !isExplicitFalse(object.enabled);
    return { available, configured, raw: object };
}
function firstText(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value.trim();
        if (Array.isArray(value)) {
            const joined = value
                .map((item) => {
                if (typeof item === 'string')
                    return item;
                const object = safeJson(item);
                return object.text || object.content || object.output_text || object.result_text || '';
            })
                .filter((item) => String(item || '').trim())
                .join('\n');
            if (joined.trim())
                return joined.trim();
        }
    }
    return '';
}
function collectNestedText(value, depth = 0) {
    if (depth > 5 || value === null || typeof value === 'undefined')
        return '';
    if (typeof value === 'string')
        return value.trim();
    if (Array.isArray(value)) {
        return value.map((item) => collectNestedText(item, depth + 1)).filter(Boolean).join('\n').trim();
    }
    if (typeof value !== 'object')
        return '';
    const object = safeJson(value);
    const direct = firstText(object.output_text, object.result_text, object.text, object.content, object.answer, object.message, object.final_text, object.finalText);
    if (direct)
        return direct;
    const choiceText = firstText(safeArray(object.choices).map((choice) => safeJson(choice).message?.content || safeJson(choice).delta?.content || safeJson(choice).text || safeJson(choice).content));
    if (choiceText)
        return choiceText;
    for (const key of ['result', 'output', 'data', 'response', 'raw', 'payload', 'job']) {
        const nested = collectNestedText(object[key], depth + 1);
        if (nested)
            return nested;
    }
    return '';
}
function normalizeOutput(data) {
    const root = safeJson(data);
    const result = safeJson(root.result || root.output || root.data || root.response || root.job);
    const output = safeJson(result.output || root.output);
    const choices = safeArray(root.choices || result.choices || output.choices);
    const text = firstText(root.output_text, root.result_text, root.text, root.content, root.message, root.answer, result.output_text, result.result_text, result.text, result.content, result.message, result.answer, output.output_text, output.result_text, output.text, output.content, output.message, output.choices?.[0]?.message?.content, choices?.[0]?.message?.content, choices?.[0]?.text, safeJson(root.data).output_text, safeJson(root.data).result_text, safeJson(root.data).text, safeJson(root.data).content);
    if (text)
        return text;
    if (typeof root.result === 'string')
        return root.result;
    if (typeof root.output === 'string')
        return root.output;
    if (typeof root.data === 'string')
        return root.data;
    const nestedText = collectNestedText(root);
    if (nestedText)
        return nestedText;
    throw new Error('官方算力返回内容为空');
}
function collectNestedAssets(value, depth = 0) {
    if (depth > 5 || value === null || typeof value === 'undefined')
        return [];
    if (Array.isArray(value))
        return value.flatMap((item) => collectNestedAssets(item, depth + 1));
    if (typeof value !== 'object')
        return [];
    const object = safeJson(value);
    const direct = object.result_assets || object.resultAssets || object.assets || object.images || object.image_urls || object.imageUrls;
    if (Array.isArray(direct))
        return direct;
    return ['result', 'output', 'data', 'response', 'raw', 'payload', 'job'].flatMap((key) => collectNestedAssets(object[key], depth + 1));
}
function normalizeAssets(data) {
    const root = safeJson(data);
    const result = safeJson(root.result || root.data);
    const output = safeJson(root.output || result.output);
    const assets = root.result_assets ||
        root.assets ||
        root.resultAssets ||
        root.images ||
        result.result_assets ||
        result.assets ||
        result.resultAssets ||
        result.images ||
        output.result_assets ||
        output.assets ||
        output.resultAssets ||
        output.images;
    const allAssets = Array.isArray(assets) ? assets : collectNestedAssets(root);
    if (!Array.isArray(allAssets))
        return [];
    return allAssets
        .map((asset) => safeJson(asset))
        .map((asset) => ({
        display_url: String(asset.display_url || asset.displayUrl || asset.url || asset.image_url || asset.imageUrl || '').trim(),
        download_url: String(asset.download_url || asset.downloadUrl || asset.display_url || asset.displayUrl || asset.url || asset.image_url || asset.imageUrl || '').trim(),
        mime_type: String(asset.mime_type || asset.mimeType || ''),
    }))
        .filter((asset) => /^https:\/\//i.test(asset.display_url || asset.download_url));
}
function mapOfficialError(status, data) {
    const code = String(data?.code || data?.error_code || data?.reason || '').toLowerCase();
    const message = String(data?.message || data?.error || '');
    const jobStatus = String(data?.status || '').toLowerCase();
    if (/failed|error|refunded|refund/.test(`${jobStatus} ${code} ${message.toLowerCase()}`)) {
        return new Error('图片生成失败，积分已按服务端规则自动退款，请稍后再试');
    }
    if (status === 401 || status === 403 || /entitlement|member|permission|unauthorized|forbidden/.test(code)) {
        return new Error('未开通运营虾会员，请开通后再使用官方 AI 算力');
    }
    if (status === 402 || /balance|credit|insufficient|积分|余额|算力|不足|欠费/.test(code + ' ' + message.toLowerCase())) {
        return new Error('官方 AI 算力积分不足，请充值/续费后再试');
    }
    if (status === 404 || code === 'official_ai_unconfigured') {
        return new Error('官方算力暂未开放');
    }
    if (status === 429 || /rate|limit/.test(code + ' ' + message.toLowerCase())) {
        return new Error('官方 AI 算力请求过于频繁，请稍后再试');
    }
    if (status >= 500 || /upstream|provider|timeout/.test(code + ' ' + message.toLowerCase())) {
        return new Error('官方 AI 上游暂时不可用，请稍后再试');
    }
    return new Error(message || `官方 AI 服务请求失败 HTTP ${status}`);
}
function isOfficialRateLimitError(error) {
    return /请求过于频繁|rate|limit|429/i.test(String(error?.message || error || ''));
}
class OfficialAIClient {
    baseUrl;
    constructor(baseUrl = ACCOUNT_BASE_URL) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
    }
    sessionCachePath() {
        return (0, path_1.join)(electron_1.app.getPath('userData'), 'data', 'account-session.bin');
    }
    readCookie() {
        const file = this.sessionCachePath();
        if (!(0, fs_1.existsSync)(file))
            throw new Error('请先登录运营虾账号');
        const wrapper = JSON.parse((0, fs_1.readFileSync)(file, 'utf8'));
        if (!wrapper?.encrypted || !electron_1.safeStorage.isEncryptionAvailable()) {
            throw new Error('账号会话不可用，请重新登录');
        }
        const state = JSON.parse(electron_1.safeStorage.decryptString(Buffer.from(wrapper.encrypted, 'base64')));
        const cookie = String(state?.cookie || '').trim();
        if (!/^[A-Za-z0-9_.-]+=/.test(cookie))
            throw new Error('账号会话已失效，请重新登录');
        return cookie;
    }
    async request(endpoint, options = {}) {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: options.method || 'GET',
            headers: {
                accept: 'application/json',
                'X-Product-Code': PRODUCT_ID,
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
                cookie: this.readCookie(),
                ...(options.body ? { 'content-type': 'application/json' } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: AbortSignal.timeout(options.timeoutMs || 30000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
            throw mapOfficialError(response.status, data);
        return { data, status: response.status };
    }
    async getCatalog() {
        const { data } = await this.request(`/api/v1/ai/catalog?product_id=${encodeURIComponent(PRODUCT_ID)}`, { timeoutMs: 15000 });
        const root = firstObject(safeJson(data.data).data, data.data, data);
        const catalog = firstObject(root.catalog, safeJson(data.data).catalog, data.catalog);
        const official = firstObject(root.official_ai, root.officialAi, catalog.official_ai, catalog.officialAi, root.official, catalog.official);
        const tasks = normalizeTaskMap(official.tasks, official.task_types, official.taskTypes, root.tasks, root.task_types, root.taskTypes, catalog.tasks, catalog.task_types, catalog.taskTypes);
        const operationAnalysis = normalizeTaskAvailability(taskFromCatalog(tasks, ANALYSIS_TASK_TYPE, official, root, catalog), true);
        const operationImage = normalizeTaskAvailability(taskFromCatalog(tasks, IMAGE_TASK_TYPE, official, root, catalog), operationAnalysis.configured);
        const balance = firstValue(official.balance, official.energy_balance, official.credits_balance, root.credits_balance, root.energy_balance, root.balance, root.user?.energy_balance, catalog.balance, catalog.energy_balance);
        const pricing = firstValue(official.pricing, official.price, root.pricing, root.price, catalog.pricing, catalog.price, operationAnalysis.raw.pricing, operationAnalysis.raw.price);
        const explicitConfigured = firstValue(official.configured, root.configured, catalog.configured);
        const configured = isExplicitFalse(explicitConfigured)
            ? false
            : explicitConfigured === true || operationAnalysis.configured || operationImage.configured || balance !== null || pricing !== null || data.ok === true;
        return {
            ok: data.ok !== false,
            configured,
            available: configured && !isExplicitFalse(firstValue(official.available, root.available, catalog.available, true)),
            operationAnalysis,
            operationImage,
            balance,
            pricing,
            entitlement: String(official.entitlement || ENTITLEMENT),
            raw: data,
        };
    }
    async ensureCatalogAvailable() {
        const catalog = await this.getCatalog();
        if (!catalog.configured) {
            throw new Error('官方算力暂未开放');
        }
        if (catalog.entitlement && catalog.entitlement !== ENTITLEMENT) {
            throw new Error('官方算力产品权益不匹配');
        }
        return catalog;
    }
    async ensureImageCatalogAvailable() {
        const catalog = await this.getCatalog();
        if (!catalog.configured || !catalog.operationImage.configured || !catalog.operationImage.available) {
            throw new Error('官方图片算力暂未开放');
        }
        if (catalog.entitlement && catalog.entitlement !== ENTITLEMENT) {
            throw new Error('官方算力产品权益不匹配');
        }
        return catalog;
    }
    buildInputText(options) {
        const chunks = [];
        for (const msg of options?.messages || []) {
            if (!msg || msg.role === 'system')
                continue;
            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || '');
            if (content.trim())
                chunks.push(content.trim());
        }
        const joined = chunks.join('\n\n').trim();
        if (!joined)
            throw new Error('官方 AI 输入内容为空');
        return joined.slice(0, 60000);
    }
    async createJob(inputText, idempotencyKey, taskType = ANALYSIS_TASK_TYPE) {
        const body = {
            product_id: PRODUCT_ID,
            task_type: taskType,
            input_text: inputText,
            idempotency_key: idempotencyKey,
        };
        const { data, status } = await this.request('/api/v1/ai/jobs', {
            method: 'POST',
            body,
            timeoutMs: 30000,
        });
        const nestedData = safeJson(data.data);
        const job = firstObject(data.job, nestedData.job, nestedData.data, data.data, data);
        const id = String(job.id || job.job_id || data.id || data.job_id || '').trim();
        if (!id)
            throw new Error('官方 AI 服务未返回任务 ID');
        return { id, status, job };
    }
    async createJobWithRetry(inputText, idempotencyKey, taskType = ANALYSIS_TASK_TYPE) {
        let lastError = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                return await this.createJob(inputText, idempotencyKey, taskType);
            }
            catch (error) {
                lastError = error;
                if (!isOfficialRateLimitError(error) || attempt === 4)
                    throw error;
                await sleep(Math.min(12000, 1200 * Math.pow(2, attempt)));
            }
        }
        throw lastError || new Error('官方 AI 服务请求失败');
    }
    async pollJob(id, output = 'text') {
        const started = Date.now();
        let pollErrors = 0;
        while (Date.now() - started < MAX_POLL_MS) {
            let data;
            try {
                ({ data } = await this.request(`/api/v1/ai/jobs/${encodeURIComponent(id)}`, { timeoutMs: 30000 }));
                pollErrors = 0;
            }
            catch (error) {
                if (isOfficialRateLimitError(error) && pollErrors < 8) {
                    pollErrors += 1;
                    await sleep(Math.min(12000, POLL_INTERVAL_MS * pollErrors));
                    continue;
                }
                throw error;
            }
            const nestedData = safeJson(data.data);
            const job = firstObject(data.job, nestedData.job, nestedData.data, data.data, data);
            const status = String(job.status || data.status || '').toLowerCase();
            if (['succeeded', 'success', 'done', 'completed'].includes(status)) {
                if (output === 'assets')
                    return normalizeAssets(job);
                return normalizeOutput(job);
            }
            if (['failed', 'error', 'cancelled', 'canceled', 'refunded'].includes(status)) {
                throw mapOfficialError(500, job);
            }
            if (!['running', 'pending', 'queued', 'processing', 'created'].includes(status)) {
                throw mapOfficialError(500, job);
            }
            await sleep(POLL_INTERVAL_MS);
        }
        throw new Error('官方 AI 任务处理超时，请稍后再试');
    }
    async runJob(options) {
        await this.ensureCatalogAvailable();
        const idempotencyKey = (0, crypto_1.randomUUID)();
        const inputText = this.buildInputText(options);
        const created = await this.createJobWithRetry(inputText, idempotencyKey, ANALYSIS_TASK_TYPE);
        return this.pollJob(created.id);
    }
    async generateImage(inputText, idempotencyKey = (0, crypto_1.randomUUID)()) {
        await this.ensureImageCatalogAvailable();
        const cleanInput = String(inputText || '').trim();
        if (!cleanInput)
            throw new Error('官方图片输入内容为空');
        const created = await this.createJobWithRetry(cleanInput.slice(0, 60000), idempotencyKey, IMAGE_TASK_TYPE);
        const initialStatus = String(created.job.status || '').toLowerCase();
        if (['succeeded', 'success', 'done', 'completed'].includes(initialStatus)) {
            const assets = normalizeAssets(created.job);
            if (assets.length === 0)
                throw new Error('官方图片任务未返回图片资源');
            return assets;
        }
        if (created.status === 202 || ['running', 'pending', 'queued', 'processing', 'created'].includes(initialStatus)) {
            const assets = await this.pollJob(created.id, 'assets');
            if (!Array.isArray(assets) || assets.length === 0)
                throw new Error('官方图片任务未返回图片资源');
            return assets;
        }
        throw mapOfficialError(500, created.job);
    }
    async chat(options) {
        const content = await this.runJob(options);
        return {
            content,
            model: 'official_ai',
            usage: undefined,
        };
    }
    async chatStream(options, onChunk) {
        const content = await this.runJob(options);
        onChunk?.({ content, done: false });
        return content;
    }
}
exports.OfficialAIClient = OfficialAIClient;
exports.officialAiClient = new OfficialAIClient();
//# sourceMappingURL=official-ai-client.js.map
