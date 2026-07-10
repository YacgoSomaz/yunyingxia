"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIClient = void 0;
const base_client_1 = require("./base-client");
const logger_1 = require("../../utils/logger");
// 默认 max_tokens 设 8192:
//   2026 年所有主流模型(deepseek-v4 / gemini-3 / gpt-5 / claude-4)max output 都 ≥ 8K,
//   老的 4096 是 2024 初的历史默认,容易把长 JSON(36 个分镜数组)截断。
//   实测 36 个分镜的富化 JSON 大约 5000-7000 token,4096 会断,8192 绰绰有余。
//   调用方仍可显式传 options.maxTokens 覆盖(scene-enrich 不需要专门传)。
const DEFAULT_MAX_TOKENS = 8192;
// ═══ DeepSeek V4 Thinking 模式开关 ═══
// true  = thinking enabled（推理走 reasoning_content，内容紧凑但慢 20+ 分钟）
// false = thinking disabled（推理灌入 content，输出可能较长但快；依赖 json_object 约束停止）
// 如果 disabled 后 Stage2 输出不停或 JSON 解析失败，改回 true
const DEEPSEEK_V4_USE_THINKING = false;
const DEEPSEEK_V4_JSON_MAX_TOKENS = DEEPSEEK_V4_USE_THINKING ? 32768 : 8192;
/** 为 deepseek-v4-* 系列在 jsonMode 调用上注入参数 */
function applyDeepseekV4JsonMode(body, model) {
    if (!/^deepseek-v\d+/i.test(model))
        return;
    body.thinking = { type: DEEPSEEK_V4_USE_THINKING ? 'enabled' : 'disabled' };
    if (!body.max_tokens || body.max_tokens < DEEPSEEK_V4_JSON_MAX_TOKENS) {
        body.max_tokens = DEEPSEEK_V4_JSON_MAX_TOKENS;
    }
}
/**
 * 泛 OpenAI-compat 客户端 — 云端化后桌面端唯一的真实 LLM client。
 *
 * 任何 OpenAI 兼容端点都用它(灵芽/百炼 compat-mode/DeepSeek/速创/柏拉图/Geek/coolapis 等)。
 * baseUrl + apiKey + model 全部由调用方从云端 user_llm_config 取出后传进来,
 * 这个 class 不再认识具体的 provider,只认 OpenAI 协议。
 */
class OpenAIClient extends base_client_1.BaseLLMClient {
    baseUrl;
    constructor(config) {
        const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        super({
            provider: config.provider || 'openai',
            apiKey: config.apiKey,
            model: config.model || 'gpt-4o-mini',
            baseUrl,
        });
        this.baseUrl = baseUrl;
    }
    async chat(options) {
        return this.withRetry(async () => {
            const body = {
                model: this.config.model,
                messages: options.messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
                top_p: options.topP,
                stop: options.stop,
            };
            if (options.jsonMode) {
                body.response_format = { type: 'json_object' };
                applyDeepseekV4JsonMode(body, this.config.model || '');
            }
            // 非流式没有中间数据可重置,只能用绝对超时;V4-Pro thinking 慢,给 *5 兜底
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeout * 5),
            });
            if (!res.ok)
                throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
            const data = (await res.json());
            const choice = data.choices[0];
            return {
                content: choice.message.content || '',
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0,
                    totalTokens: data.usage?.total_tokens || 0,
                },
                model: data.model || this.config.model,
                finishReason: choice.finish_reason || 'stop',
            };
        }, 'openai-chat');
    }
    async chatStream(options, onChunk) {
        return this.withRetry(async () => {
            const body = {
                model: this.config.model,
                messages: options.messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
                stream: true,
            };
            if (options.jsonMode) {
                body.response_format = { type: 'json_object' };
                applyDeepseekV4JsonMode(body, this.config.model || '');
            }
            // 空闲超时:只有连续 idleMs 没收到任何 SSE 数据才断开,数据持续到达时永不超时。
            // 为什么不用 AbortSignal.timeout(绝对超时):
            //   V4-Pro thinking enabled 时推理阶段 SSE 持续吐 delta.reasoning_content(2-3 分钟),
            //   绝对超时会在推理还没结束时就把连接掐掉。
            // 空闲超时只在真正卡死(网断/服务挂)时才触发,推理多久都不会被误杀。
            const idleMs = options.timeoutMs ?? this.config.timeout * 3;
            const controller = new AbortController();
            let idleTimer = setTimeout(() => controller.abort(), idleMs);
            const resetIdle = () => {
                if (idleTimer)
                    clearTimeout(idleTimer);
                idleTimer = setTimeout(() => controller.abort(), idleMs);
            };
            const clearIdle = () => {
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
            };
            try {
                const res = await fetch(`${this.baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${this.config.apiKey}`,
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                if (!res.ok)
                    throw new Error(`OpenAI Stream ${res.status}`);
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let full = '';
                let buffer = '';
                let streamDone = false;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    resetIdle(); // ← 收到任何字节(content / reasoning_content / keepalive)就重置空闲计时器
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        if (line === 'data: [DONE]') {
                            streamDone = true;
                            onChunk({ content: '', isFinished: true });
                            break;
                        }
                        if (!line.startsWith('data: '))
                            continue;
                        try {
                            const json = JSON.parse(line.slice(6));
                            const delta = json.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                full += delta;
                                onChunk({ content: delta, isFinished: false });
                            }
                            const finishReason = json.choices?.[0]?.finish_reason;
                            if (finishReason) {
                                if (finishReason === 'length') {
                                    // max_tokens 截断 — 上层 extractJson 大概率会失败,提前 warn 留诊断线索
                                    logger_1.logger.warn(`[OpenAI Stream] finish_reason=length 输出被 max_tokens 截断 ` +
                                        `model=${this.config.model} accumulated=${full.length}chars,` +
                                        `建议调用方显式传 maxTokens (当前默认 ${DEFAULT_MAX_TOKENS})`);
                                }
                                onChunk({ content: '', isFinished: true });
                                streamDone = true;
                                break;
                            }
                        }
                        catch {
                            /* skip */
                        }
                    }
                    if (streamDone) {
                        reader.cancel().catch(() => { });
                        break;
                    }
                }
                return full;
            }
            finally {
                clearIdle();
            }
        }, 'openai-stream');
    }
}
exports.OpenAIClient = OpenAIClient;
//# sourceMappingURL=openai-client.js.map