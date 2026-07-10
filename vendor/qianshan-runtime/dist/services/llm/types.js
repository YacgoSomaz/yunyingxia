"use strict";
// ══════════════════════════════════════════════════════════════════
//  LLM 类型 — 完全云端化版本
//
//  桌面端不再维护多个本地 provider client。所有 LLM 调用都用一个
//  泛 OpenAI-compat client(openai-client.ts),baseUrl/apiKey/model
//  全部从云端 user_llm_config 取。
//
//  LLMProvider 现在等于云端 user_llm_config.providerCode 的字符串,
//  比如 'lingya' / 'aliyun_dashscope' / 'deepseek' / 'wuyinkeji' / 'cool' / 'bltcy' / 'geek'
//  外加一个 'mock'(没登录前 boot 兜底)。
// ══════════════════════════════════════════════════════════════════
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map