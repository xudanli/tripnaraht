"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RetryPolicyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryPolicyService = void 0;
const common_1 = require("@nestjs/common");
let RetryPolicyService = RetryPolicyService_1 = class RetryPolicyService {
    constructor() {
        this.logger = new common_1.Logger(RetryPolicyService_1.name);
    }
    async executeWithRetry(operation, config = {}) {
        const maxRetries = config.maxRetries || 3;
        const initialDelay = config.initialDelay || 1000;
        const maxDelay = config.maxDelay || 30000;
        const backoffMultiplier = config.backoffMultiplier || 2;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt === maxRetries) {
                    this.logger.warn(`[RetryPolicy] 操作失败，已达到最大重试次数: ${maxRetries}`);
                    throw error;
                }
                const delay = Math.min(initialDelay * Math.pow(backoffMultiplier, attempt), maxDelay);
                this.logger.debug(`[RetryPolicy] 操作失败，${delay}ms后重试 (尝试 ${attempt + 1}/${maxRetries})`);
                await this.sleep(delay);
            }
        }
        throw lastError || new Error('Retry failed');
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.RetryPolicyService = RetryPolicyService;
exports.RetryPolicyService = RetryPolicyService = RetryPolicyService_1 = __decorate([
    (0, common_1.Injectable)()
], RetryPolicyService);
//# sourceMappingURL=retry-policy.service.js.map