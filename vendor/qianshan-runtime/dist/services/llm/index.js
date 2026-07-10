"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llm = void 0;
// ══════════════════════════════════════════════════════════════════════
//  LLM 服务 — 完全云端化版本
//
//  ① 没有任何"本地 provider client" —— qwen / deepseek / claude / ollama
//     专用 client 全部删了。所有云端 preset(lingya/wuyinkeji/cool/bltcy/geek/
//     aliyun_dashscope/deepseek)都是 OpenAI-compat,共用 OpenAIClient 一个壳,
//     baseUrl 用云端那条配置的字段。
//  ② Credentials 由 llm-config.reloadIntoRuntime() 推进来:
//     provider 字段 = 云端 user_llm_config.providerCode (如 'lingya' / 'aliyun_dashscope')
//  ③ Routing scene → {provider, model} 由 llm-tier-config 同步,
//     scene 解析时 provider 也是 cloud providerCode。
//  ④ 没有任何 cred → MockLLMClient 兜底(未登录前 boot 阶段会用到)。
// ══════════════════════════════════════════════════════════════════════
const openai_client_1 = require("./openai-client");
const mock_client_1 = require("./mock-client");
const logger_1 = require("../../utils/logger");
/**
 * 从 LLM 返回文本中稳健抽取 JSON。
 * 处理：1) markdown 代码块 ```json ... ```；2) 前后解释性废话；3) 先试 {...} 再试 [...]
 * 用非贪婪匹配并带平衡括号兜底,避免把两段 JSON 之间的解释文字当一坨抓起来。
 */
function extractJson(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const stripped = fenced ? fenced[1].trim() : text.trim();
    try {
        return JSON.parse(stripped);
    }
    catch {
        /* fall through */
    }
    const tryParse = (open, close) => {
        const start = stripped.indexOf(open);
        if (start < 0)
            return null;
        let depth = 0;
        let inStr = false;
        let esc = false;
        for (let i = start; i < stripped.length; i++) {
            const ch = stripped[i];
            if (inStr) {
                if (esc)
                    esc = false;
                else if (ch === '\\')
                    esc = true;
                else if (ch === '"')
                    inStr = false;
                continue;
            }
            if (ch === '"')
                inStr = true;
            else if (ch === open)
                depth++;
            else if (ch === close) {
                depth--;
                if (depth === 0) {
                    const slice = stripped.slice(start, i + 1);
                    try {
                        return JSON.parse(slice);
                    }
                    catch {
                        return null;
                    }
                }
            }
        }
        return null;
    };
    const firstObj = stripped.indexOf('{');
    const firstArr = stripped.indexOf('[');
    const tryOrder = firstObj < 0
        ? [['[', ']']]
        : firstArr < 0
            ? [['{', '}']]
            : firstObj < firstArr
                ? [['{', '}'], ['[', ']']]
                : [['[', ']'], ['{', '}']];
    for (const [o, c] of tryOrder) {
        const parsed = tryParse(o, c);
        if (parsed !== null)
            return parsed;
    }
    // 解析失败前打印 text 诊断信息 — 上面 chatStream 也会打 finish_reason=length
    // 配合看就能判断"截断 vs 非 JSON 格式输出 vs 解释性文字混入"
    // 长文本只打前 500 字,避免日志爆炸;末尾 100 字单独打,看断点
    const head = text.slice(0, 500);
    const tail = text.length > 500 ? text.slice(-100) : '';
    logger_1.logger.warn(`[extractJson] 解析失败 textLen=${text.length}\n` +
        `--- head(500) ---\n${head}\n` +
        (tail ? `--- tail(100) ---\n${tail}\n` : '') +
        `------------------`);
    throw new Error('LLM 返回内容不是有效 JSON');
}
/**
 * LLMService —— 云端凭据 + scene routing,单一泛 OpenAI-compat client。
 *
 * 主要 API:
 *   - completeWithScene(scene, sys, user) → 按 scene 路由到 cloud config 后调 chat
 *   - completeJSONWithScene / Stream      → 同上,JSON 抽取
 *   - testProvider(provider, model, apiKey, baseUrl) → 给 UI 测连通用,绕开 cred 池
 */
class LLMService {
    /** 客户端池:cacheKey = provider+model+baseUrl+apiKey 前缀 */
    clients = new Map();
    /** 场景路由:scene → { provider(=云端 providerCode), model } */
    routing = new Map();
    /** 已配置的凭据:provider(=云端 providerCode) → { apiKey, baseUrl } */
    credentials = new Map();
    /** ——— 由 llm-config 在启动后调用,注入云端配置 ——— */
    setRouting(routing) {
        this.routing.clear();
        for (const r of routing) {
            this.routing.set(r.scene, { provider: r.provider, model: r.model });
        }
    }
    setCredentials(creds) {
        this.credentials.clear();
        this.clients.clear(); // 清 client 池(凭据可能变了)
        for (const c of creds) {
            this.credentials.set(c.provider, { apiKey: c.apiKey, baseUrl: c.baseUrl || undefined });
        }
    }
    /** 当前已注册的 provider 集合(不含 mock) */
    listRegisteredProviders() {
        return Array.from(this.credentials.keys());
    }
    /** 是否至少配置了一个真实凭据 */
    hasAnyRealCredential() {
        return this.credentials.size > 0;
    }
    // ═══════════════ client 池 ═══════════════
    buildClient(provider, apiKey, model, baseUrl) {
        if (provider === 'mock')
            return new mock_client_1.MockLLMClient();
        return new openai_client_1.OpenAIClient({ apiKey, model, baseUrl, provider });
    }
    getClient(provider, model) {
        if (provider === 'mock') {
            const k = 'mock';
            if (!this.clients.has(k))
                this.clients.set(k, new mock_client_1.MockLLMClient());
            return this.clients.get(k);
        }
        const cred = this.credentials.get(provider);
        if (!cred?.apiKey) {
            logger_1.logger.warn(`[LLM] No credential for ${provider}, falling back to mock`);
            return this.getClient('mock');
        }
        const cacheKey = `${provider}::${model || 'default'}::${cred.baseUrl || ''}::${cred.apiKey.slice(0, 6)}`;
        if (!this.clients.has(cacheKey)) {
            this.clients.set(cacheKey, this.buildClient(provider, cred.apiKey, model, cred.baseUrl));
        }
        return this.clients.get(cacheKey);
    }
    // ═══════════════ 默认 client(无 scene 调用) ═══════════════
    pickDefaultClient() {
        const first = this.credentials.keys().next().value;
        if (first)
            return this.getClient(first);
        return this.getClient('mock');
    }
    // ═══════════════ 老接口(保留兼容) ═══════════════
    async chat(options) {
        return this.pickDefaultClient().chat(options);
    }
    async chatStream(options, onChunk) {
        return this.pickDefaultClient().chatStream(options, onChunk);
    }
    async complete(systemPrompt, userPrompt, temperature = 0.7) {
        const res = await this.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature,
        });
        return res.content;
    }
    async completeJSON(systemPrompt, userPrompt) {
        const text = await this.complete(systemPrompt + '\n\n你必须输出纯 JSON,不要包含 markdown 代码块标记。', userPrompt, 0.3);
        return extractJson(text);
    }
    // ═══════════════ 新接口:按场景路由 ═══════════════
    pickClientForScene(scene) {
        const route = this.routing.get(scene);
        if (route)
            return this.getClient(route.provider, route.model);
        return this.pickDefaultClient();
    }
    async completeWithScene(scene, systemPrompt, userPrompt, temperature = 0.7) {
        const client = this.pickClientForScene(scene);
        const res = await client.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature,
        });
        return res.content;
    }
    async completeJSONWithScene(scene, systemPrompt, userPrompt) {
        const client = this.pickClientForScene(scene);
        // 直接调 chat 而非 completeWithScene — 因为要传 jsonMode:true 启用 response_format
        // (标准 OpenAI JSON mode + DeepSeek V4 thinking + max_tokens 32768)
        const res = await client.chat({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt + '\n\n你必须输出纯 JSON,不要包含 markdown 代码块标记。',
                },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            jsonMode: true,
        });
        return extractJson(res.content);
    }
    /**
     * 流式版 completeJSONWithScene。适合输出大 / 耗时长的场景(导演分析、长拆分镜)。
     * onChunk 可选;maxTokens 默认走底层(4096),长输出建议 8192;timeoutMs 默认 180s,长任务建议 360_000。
     */
    async completeJSONWithSceneStream(scene, systemPrompt, userPrompt, onChunk, maxTokens, timeoutMs) {
        const client = this.pickClientForScene(scene);
        const full = await client.chatStream({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt + '\n\n你必须输出纯 JSON,不要包含 markdown 代码块标记。',
                },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            maxTokens,
            timeoutMs,
            jsonMode: true,
        }, onChunk || (() => { }));
        return extractJson(full);
    }
    /** 强制指定 provider+model 的流式 JSON 调用(绕开 routing,降级用) */
    async completeJSONWithSceneStreamForceModel(provider, model, systemPrompt, userPrompt, onChunk, maxTokens, timeoutMs) {
        const client = this.getClient(provider, model);
        const full = await client.chatStream({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt + '\n\n你必须输出纯 JSON,不要包含 markdown 代码块标记。',
                },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.3,
            maxTokens,
            timeoutMs,
            jsonMode: true,
        }, onChunk || (() => { }));
        return extractJson(full);
    }
    /** 当前 routing 中场景对应的 provider+model(无 routing 时返回 null) */
    getRoutingForScene(scene) {
        return this.routing.get(scene) || null;
    }
    async chatStreamWithScene(scene, options, onChunk) {
        const client = this.pickClientForScene(scene);
        return client.chatStream(options, onChunk);
    }
    // ═══════════════ 测试:绕开 cred 池直接发 ═══════════════
    async testProvider(provider, model, apiKey, baseUrl) {
        const client = this.buildClient(provider, apiKey, model, baseUrl);
        const res = await client.chat({
            messages: [
                { role: 'system', content: '你是助手。' },
                { role: 'user', content: '回复"ok"即可,不要其它内容。' },
            ],
            temperature: 0,
            maxTokens: 20,
        });
        return res.content;
    }
    /** 当前 LLM 对外的元信息(给前端 Header badge) */
    infoSummary() {
        // 多 cloud provider 共存时显示 'mixed';0 个时显示 'mock'
        const routedProviders = Array.from(this.routing.values()).map((r) => r.provider);
        const uniq = Array.from(new Set(routedProviders));
        const effectiveProvider = this.credentials.size === 0 ? 'mock' : uniq.length === 1 ? uniq[0] : 'mixed';
        return {
            provider: effectiveProvider,
            useMock: this.credentials.size === 0,
            routingCount: this.routing.size,
            credCount: this.credentials.size,
            mixed: uniq.length > 1,
        };
    }
}
exports.llm = new LLMService();
//# sourceMappingURL=index.js.map