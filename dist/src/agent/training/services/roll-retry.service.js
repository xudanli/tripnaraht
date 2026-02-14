"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RollRetryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollRetryService = void 0;
const common_1 = require("@nestjs/common");
let RollRetryService = RollRetryService_1 = class RollRetryService {
    constructor() {
        this.logger = new common_1.Logger(RollRetryService_1.name);
        this.retryConfig = {
            maxRetries: 3,
            initialDelay: 100,
            maxDelay: 5000,
            backoffMultiplier: 2,
            retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'],
        };
    }
    async executeWithRetry(operation, operationName, customConfig) {
        const config = { ...this.retryConfig, ...customConfig };
        let lastError = null;
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                const result = await operation();
                if (attempt > 0) {
                    this.logger.log(`[RollRetry] ${operationName} 重试成功 (attempt ${attempt + 1})`);
                }
                return result;
            }
            catch (error) {
                lastError = error;
                if (!this.isRetryableError(error) || attempt >= config.maxRetries) {
                    this.logger.error(`[RollRetry] ${operationName} 失败 (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}`);
                    throw error;
                }
                const delay = Math.min(config.initialDelay * Math.pow(config.backoffMultiplier, attempt), config.maxDelay);
                this.logger.warn(`[RollRetry] ${operationName} 失败，${delay}ms 后重试 (attempt ${attempt + 1}/${config.maxRetries + 1}): ${error.message}`);
                await this.sleep(delay);
            }
        }
        throw lastError || new Error(`${operationName} 重试失败`);
    }
    isRetryableError(error) {
        var _a, _b, _c, _d;
        if (error.code && this.retryConfig.retryableErrors.includes(error.code)) {
            return true;
        }
        if (error.status >= 500 && error.status < 600) {
            return true;
        }
        if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('timeout')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('TIMEOUT'))) {
            return true;
        }
        if (((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('ECONNREFUSED')) || ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('fetch failed'))) {
            return true;
        }
        return false;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.RollRetryService = RollRetryService;
exports.RollRetryService = RollRetryService = RollRetryService_1 = __decorate([
    (0, common_1.Injectable)()
], RollRetryService);
//# sourceMappingURL=roll-retry.service.js.map