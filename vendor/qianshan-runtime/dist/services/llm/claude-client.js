"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeClient = void 0;
const base_client_1 = require("./base-client");
const types_1 = require("./types");
/**
 * Anthropic Claude 客户端。与 OpenAI 结构不同：
 *  - header：`x-api-key` + `anthropic-version`
 *  - system 单独字段（不在 messages 里）
 *  - 流式用 SSE，关键事件是 `content_block_delta`，其 `delta.text` 是增量
 */
class ClaudeClient extends base_client_1.BaseLLMClient {
    baseUrl;
    constructor(config) {
        const defaults = types_1.PROVIDER_DEFAULTS.claude;
        super({
            provider: 'claude',
            apiKey: config.apiKey,
            model: config.model || defaults.model,
            baseUrl: config.baseUrl || defaults.baseUrl,
        });
        this.baseUrl = config.baseUrl || defaults.baseUrl;
    }
    /** 把 OpenAI 风格的 messages 拆成 { system, messages } */
    splitMessages(messages) {
        const systems = messages.filter((m) => m.role === 'system').map((m) => m.content);
        const rest = messages.filter((m) => m.role !== 'system').map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
        }));
        return { system: systems.join('\n'), messages: rest };
    }
    async chat(options) {
        return this.withRetry(async () => {
            const { system, messages } = this.splitMessages(options.messages);
            const res = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.config.model,
                    max_tokens: options.maxTokens ?? 4096,
                    temperature: options.temperature ?? 0.7,
                    system: system || undefined,
                    messages,
                }),
                signal: AbortSignal.timeout(this.config.timeout),
            });
            if (!res.ok)
                throw new Error(`Claude API ${res.status}: ${await res.text()}`);
            const data = (await res.json());
            // content 是数组：[{ type:'text', text:'...' }, ...]
            const text = (data.content || [])
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('');
            return {
                content: text,
                usage: {
                    promptTokens: data.usage?.input_tokens || 0,
                    completionTokens: data.usage?.output_tokens || 0,
                    totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
                },
                model: data.model || this.config.model,
                finishReason: data.stop_reason || 'stop',
            };
        }, 'claude-chat');
    }
    async chatStream(options, onChunk) {
        return this.withRetry(async () => {
            const { system, messages } = this.splitMessages(options.messages);
            const res = await fetch(`${this.baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.config.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.config.model,
                    max_tokens: options.maxTokens ?? 4096,
                    temperature: options.temperature ?? 0.7,
                    system: system || undefined,
                    messages,
                    stream: true,
                }),
                signal: AbortSignal.timeout(options.timeoutMs ?? this.config.timeout * 3),
            });
            if (!res.ok)
                throw new Error(`Claude Stream ${res.status}`);
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
                // Anthropic SSE：事件块由两行分隔（event: ... + data: {...}），块间 \n\n
                const blocks = buffer.split('\n\n');
                buffer = blocks.pop() || '';
                for (const block of blocks) {
                    const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
                    if (!dataLine)
                        continue;
                    const jsonStr = dataLine.slice(6).trim();
                    if (!jsonStr || jsonStr === '[DONE]') {
                        streamDone = true;
                        onChunk({ content: '', isFinished: true });
                        break;
                    }
                    try {
                        const json = JSON.parse(jsonStr);
                        if (json.type === 'content_block_delta') {
                            const delta = json.delta?.text || '';
                            if (delta) {
                                full += delta;
                                onChunk({ content: delta, isFinished: false });
                            }
                        }
                        else if (json.type === 'message_stop') {
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
        }, 'claude-stream');
    }
}
exports.ClaudeClient = ClaudeClient;
//# sourceMappingURL=claude-client.js.map