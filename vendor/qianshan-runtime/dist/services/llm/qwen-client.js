"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QwenClient = void 0;
const base_client_1 = require("./base-client");
const types_1 = require("./types");
async function sanitizeProviderError(res, label) {
    const text = await res.text().catch(() => '');
    let code = '';
    let message = '';
    try {
        const json = JSON.parse(text);
        code = String(json?.error?.code || json?.code || '');
        message = String(json?.error?.message || json?.message || json?.error || '');
    }
    catch {
        message = text;
    }
    const lower = `${code} ${message}`.toLowerCase();
    if (res.status === 401 || res.status === 403 || /api[\s_-]*key|authentication|unauthorized|forbidden|invalid_request_error|invalid.*key|permission/.test(lower)) {
        return new Error(`${label} ${res.status}: API Key 无效或无权限，请检查本地模型配置或切换官方算力`);
    }
    if (res.status === 429 || /rate|limit|quota/.test(lower)) {
        return new Error(`${label} ${res.status}: 模型服务限流或额度不足，请稍后再试`);
    }
    if (res.status >= 500) {
        return new Error(`${label} ${res.status}: 模型服务暂时不可用，请稍后再试`);
    }
    return new Error(`${label} ${res.status}: 模型服务请求失败`);
}
class QwenClient extends base_client_1.BaseLLMClient {
    baseUrl;
    constructor(config) {
        const defaults = types_1.PROVIDER_DEFAULTS.qwen;
        super({
            provider: 'qwen',
            apiKey: config.apiKey,
            model: config.model || defaults.model,
            baseUrl: defaults.baseUrl,
        });
        this.baseUrl = defaults.baseUrl;
    }
    async chat(options) {
        return this.withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: options.messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 4096,
                    top_p: options.topP,
                    stop: options.stop,
                }),
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!res.ok) {
                throw await sanitizeProviderError(res, 'Qwen API');
            }
            const data = (await res.json());
            const choice = data.choices[0];
            return {
                content: choice.message.content,
                usage: {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens,
                },
                model: data.model,
                finishReason: choice.finish_reason,
            };
        }, 'qwen-chat');
    }
    async chatStream(options, onChunk) {
        return this.withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: options.messages,
                    temperature: options.temperature ?? 0.7,
                    max_tokens: options.maxTokens ?? 4096,
                    stream: true,
                }),
                signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeout * 3),
            });
            if (!res.ok)
                throw new Error(`Qwen Stream ${res.status}`);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let full = '';
            let buffer = '';
            let streamDone = false;
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
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
                        if (json.choices?.[0]?.finish_reason) {
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
        }, 'qwen-stream');
    }
}
exports.QwenClient = QwenClient;
//# sourceMappingURL=qwen-client.js.map
