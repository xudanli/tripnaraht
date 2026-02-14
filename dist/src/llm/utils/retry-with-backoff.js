"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryWithBackoff = retryWithBackoff;
const DEFAULT_RETRYABLE_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'ECONNREFUSED',
    'no response received',
    'network',
    'timeout',
];
async function retryWithBackoff(fn, options = {}) {
    const { maxRetries = 3, initialDelayMs = 200, maxDelayMs = 2000, factor = 2, jitter = true, retryableErrors = DEFAULT_RETRYABLE_ERRORS, retryCondition, } = options;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt >= maxRetries) {
                throw error;
            }
            let isRetryable = false;
            if (retryCondition) {
                isRetryable = retryCondition(error);
            }
            else {
                const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
                const errorCode = (error === null || error === void 0 ? void 0 : error.code) || '';
                isRetryable = retryableErrors.some(retryableError => errorMessage.includes(retryableError) ||
                    errorCode.includes(retryableError));
            }
            if (!isRetryable) {
                throw error;
            }
            const baseDelay = Math.min(initialDelayMs * Math.pow(factor, attempt), maxDelayMs);
            const jitterAmount = jitter ? baseDelay * 0.2 * (Math.random() * 2 - 1) : 0;
            const delay = Math.max(0, baseDelay + jitterAmount);
            await new Promise(resolve => setTimeout(resolve, Math.round(delay)));
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry-with-backoff.js.map