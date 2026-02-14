"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RetryHelperService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryHelperService = void 0;
const common_1 = require("@nestjs/common");
let RetryHelperService = RetryHelperService_1 = class RetryHelperService {
    constructor() {
        this.logger = new common_1.Logger(RetryHelperService_1.name);
        this.DEFAULT_CONFIG = {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 30000,
            backoffFactor: 2,
            retryableErrors: [],
            nonRetryableErrors: [
                'ValidationError',
                'AuthenticationError',
                'AuthorizationError',
                'NotFoundError',
                '400',
                '401',
                '403',
                '404',
            ],
            logging: true,
        };
    }
    async executeWithRetry(operation, config) {
        const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
        const startTime = Date.now();
        let attemptCount = 0;
        let lastError;
        while (attemptCount <= finalConfig.maxRetries) {
            attemptCount++;
            try {
                if (finalConfig.logging && attemptCount > 1) {
                    this.logger.log(`[Retry] 第 ${attemptCount} 次尝试...`);
                }
                const result = await operation();
                const totalDuration = Date.now() - startTime;
                if (finalConfig.logging && attemptCount > 1) {
                    this.logger.log(`[Retry] ✓ 第 ${attemptCount} 次尝试成功 (耗时: ${totalDuration}ms)`);
                }
                return {
                    result,
                    success: true,
                    attemptCount,
                    totalDuration,
                };
            }
            catch (error) {
                lastError = error;
                const shouldRetry = this.shouldRetry(error, attemptCount, finalConfig);
                if (!shouldRetry) {
                    if (finalConfig.logging) {
                        this.logger.warn(`[Retry] ✗ 不可重试错误或达到最大重试次数: ${error.message}`);
                    }
                    return {
                        success: false,
                        attemptCount,
                        totalDuration: Date.now() - startTime,
                        lastError,
                    };
                }
                const delay = this.calculateDelay(attemptCount, finalConfig);
                if (finalConfig.logging) {
                    this.logger.warn(`[Retry] 第 ${attemptCount} 次尝试失败: ${error.message}, 等待 ${delay}ms 后重试...`);
                }
                await this.sleep(delay);
            }
        }
        return {
            success: false,
            attemptCount,
            totalDuration: Date.now() - startTime,
            lastError,
        };
    }
    shouldRetry(error, attemptCount, config) {
        if (attemptCount >= config.maxRetries) {
            return false;
        }
        const errorName = error.name;
        const errorMessage = error.message;
        if (config.nonRetryableErrors.length > 0) {
            const isNonRetryable = config.nonRetryableErrors.some(pattern => errorName.includes(pattern) || errorMessage.includes(pattern));
            if (isNonRetryable) {
                return false;
            }
        }
        if (config.retryableErrors.length > 0) {
            const isRetryable = config.retryableErrors.some(pattern => errorName.includes(pattern) || errorMessage.includes(pattern));
            return isRetryable;
        }
        return true;
    }
    calculateDelay(attemptCount, config) {
        const delay = config.initialDelayMs * Math.pow(config.backoffFactor, attemptCount - 1);
        return Math.min(delay, config.maxDelayMs);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    createRetrier(config) {
        return (operation) => this.executeWithRetry(operation, config);
    }
    async retryApiCall(operation, operationName) {
        return this.executeWithRetry(operation, {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffFactor: 2,
            retryableErrors: [
                'ECONNREFUSED',
                'ECONNRESET',
                'ETIMEDOUT',
                'ENOTFOUND',
                'NetworkError',
                'TimeoutError',
                '500',
                '502',
                '503',
                '504',
            ],
            logging: true,
        });
    }
    async retryDbQuery(operation, queryName) {
        return this.executeWithRetry(operation, {
            maxRetries: 2,
            initialDelayMs: 500,
            maxDelayMs: 5000,
            backoffFactor: 2,
            retryableErrors: [
                'ECONNREFUSED',
                'ECONNRESET',
                'LockTimeout',
                'DeadlockDetected',
            ],
            logging: true,
        });
    }
};
exports.RetryHelperService = RetryHelperService;
exports.RetryHelperService = RetryHelperService = RetryHelperService_1 = __decorate([
    (0, common_1.Injectable)()
], RetryHelperService);
//# sourceMappingURL=retry-helper.service.js.map