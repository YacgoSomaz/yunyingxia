"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeepSeekClient = void 0;
const base_client_1 = require("./base-client");
const types_1 = require("./types");
class DeepSeekClient extends base_client_1.BaseLLMClient {
    baseUrl;
    constructor(config) {
        const defaults = types_1.PROVIDER_DEFAULTS.deepseek;
        super({
            provider: 'deepseek',
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
                }),
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!res.ok)
                throw new Error(`DeepSeek API ${res.status}: ${await res.text()}`);
            const data = (await res.json());
            return {
                content: data.choices[0].message.content,
                usage: {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                    totalTokens: data.usage.total_tokens,
                },
                model: data.model,
                finishReason: data.choices[0].finish_reason,
            };
        }, 'deepseek-chat');
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
                throw new Error(`DeepSeek Stream ${res.status}`);
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
        }, 'deepseek-stream');
    }
}
exports.DeepSeekClient = DeepSeekClient;
//# sourceMappingURL=deepseek-client.js.map