"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseLLMClient = void 0;
const logger_1 = require("../../utils/logger");
class BaseLLMClient {
    config;
    constructor(config) {
        this.config = {
            maxRetries: 3,
            timeout: 60000,
            baseUrl: '',
            ...config,
        };
    }
    async withRetry(fn, label) {
        let lastError = null;
        for (let i = 0; i < this.config.maxRetries; i++) {
            try {
                return await fn();
            }
            catch (err) {
                lastError = err;
                const delay = Math.min(1000 * Math.pow(2, i), 10000);
                logger_1.logger.warn(`[LLM] ${label} attempt ${i + 1} failed: ${lastError.message}, retry in ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
        throw lastError;
    }
}
exports.BaseLLMClient = BaseLLMClient;
//# sourceMappingURL=base-client.js.map