"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaClient = void 0;
const base_client_1 = require("./base-client");
const types_1 = require("./types");
/**
 * 本地 Ollama 客户端。无需 apiKey。
 * 端点默认 http://localhost:11434，可通过 baseUrl 覆盖。
 * 流式每行是一段 JSON（不是 SSE），逐行解析 `message.content` 累加。
 */
class OllamaClient extends base_client_1.BaseLLMClient {
    baseUrl;
    constructor(config) {
        const defaults = types_1.PROVIDER_DEFAULTS.ollama;
        super({
            provider: 'ollama',
            apiKey: config.apiKey || 'ollama',
            model: config.model || defaults.model,
            baseUrl: config.baseUrl || defaults.baseUrl,
        });
        this.baseUrl = config.baseUrl || defaults.baseUrl;
    }
    async chat(options) {
        return this.withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: options.messages,
                    stream: false,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 4096,
                    },
                }),
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!res.ok)
                throw new Error(`Ollama API ${res.status}: ${await res.text()}`);
            const data = (await res.json());
            return {
                content: data.message?.content || '',
                usage: {
                    promptTokens: data.prompt_eval_count || 0,
                    completionTokens: data.eval_count || 0,
                    totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                },
                model: data.model || this.config.model,
                finishReason: data.done ? 'stop' : 'length',
            };
        }, 'ollama-chat');
    }
    async chatStream(options, onChunk) {
        return this.withRetry(async () => {
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: options.messages,
                    stream: true,
                    options: {
                        temperature: options.temperature ?? 0.7,
                        num_predict: options.maxTokens ?? 4096,
                    },
                }),
                signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeout * 3),
            });
            if (!res.ok)
                throw new Error(`Ollama Stream ${res.status}`);
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let full = '';
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (!line.trim())
                        continue;
                    try {
                        const json = JSON.parse(line);
                        const delta = json.message?.content || '';
                        if (delta) {
                            full += delta;
                            onChunk({ content: delta, isFinished: false });
                        }
                        if (json.done) {
                            onChunk({ content: '', isFinished: true });
                        }
                    }
                    catch {
                        /* skip */
                    }
                }
            }
            return full;
        }, 'ollama-stream');
    }
}
exports.OllamaClient = OllamaClient;
//# sourceMappingURL=ollama-client.js.map