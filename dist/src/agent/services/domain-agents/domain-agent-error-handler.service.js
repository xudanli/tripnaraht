"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DomainAgentErrorHandler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainAgentErrorHandler = exports.DomainAgentError = exports.DomainAgentErrorType = void 0;
const common_1 = require("@nestjs/common");
var DomainAgentErrorType;
(function (DomainAgentErrorType) {
    DomainAgentErrorType["DATA_SOURCE_UNAVAILABLE"] = "DATA_SOURCE_UNAVAILABLE";
    DomainAgentErrorType["DATA_SOURCE_TIMEOUT"] = "DATA_SOURCE_TIMEOUT";
    DomainAgentErrorType["DATA_FORMAT_ERROR"] = "DATA_FORMAT_ERROR";
    DomainAgentErrorType["DATA_VALIDATION_ERROR"] = "DATA_VALIDATION_ERROR";
    DomainAgentErrorType["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    DomainAgentErrorType["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    DomainAgentErrorType["UNKNOWN_ERROR"] = "UNKNOWN_ERROR";
})(DomainAgentErrorType || (exports.DomainAgentErrorType = DomainAgentErrorType = {}));
class DomainAgentError extends Error {
    constructor(type, agent, operation, message, originalError, context) {
        super(`[${agent}.${operation}] ${message}`);
        this.type = type;
        this.agent = agent;
        this.operation = operation;
        this.originalError = originalError;
        this.context = context;
        this.name = 'DomainAgentError';
    }
}
exports.DomainAgentError = DomainAgentError;
let DomainAgentErrorHandler = DomainAgentErrorHandler_1 = class DomainAgentErrorHandler {
    constructor() {
        this.logger = new common_1.Logger(DomainAgentErrorHandler_1.name);
        this.defaultStrategies = {
            GeoAgent: {
                useCache: true,
                maxCacheAge: 86400,
                useDefaults: true,
                retry: true,
                retryCount: 2,
                retryDelay: 1000,
            },
            WeatherAgent: {
                useCache: true,
                maxCacheAge: 3600,
                useDefaults: true,
                retry: true,
                retryCount: 3,
                retryDelay: 500,
            },
            CostAgent: {
                useCache: true,
                maxCacheAge: 43200,
                useDefaults: true,
                retry: false,
            },
            ExperienceAgent: {
                useCache: false,
                useDefaults: true,
                retry: false,
            },
        };
    }
    classifyError(error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('unavailable')) {
            return DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE;
        }
        if (msg.includes('timeout') || msg.includes('timedout') || msg.includes('etimedout')) {
            return DomainAgentErrorType.DATA_SOURCE_TIMEOUT;
        }
        if (msg.includes('parse') || msg.includes('json') || msg.includes('format')) {
            return DomainAgentErrorType.DATA_FORMAT_ERROR;
        }
        if (msg.includes('invalid') || msg.includes('validation')) {
            return DomainAgentErrorType.DATA_VALIDATION_ERROR;
        }
        if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429')) {
            return DomainAgentErrorType.QUOTA_EXCEEDED;
        }
        if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('401') || msg.includes('403')) {
            return DomainAgentErrorType.PERMISSION_DENIED;
        }
        return DomainAgentErrorType.UNKNOWN_ERROR;
    }
    async handleError(agent, operation, error, fallbackData, customStrategy) {
        const errorType = this.classifyError(error);
        const strategy = { ...this.defaultStrategies[agent], ...customStrategy };
        const domainError = new DomainAgentError(errorType, agent, operation, error.message, error);
        this.logger.warn(`[${agent}.${operation}] Error: ${errorType} - ${error.message}`);
        const evidence = {
            evidence_id: `error_${agent}_${Date.now()}`,
            source: `${agent}.${operation}`,
            timestamp: new Date().toISOString(),
            data: {
                error_type: errorType,
                error_message: error.message,
                recovered: false,
                strategy_applied: strategy,
            },
        };
        let recovered = false;
        let data;
        if (strategy.useDefaults && fallbackData !== undefined) {
            data = fallbackData;
            recovered = true;
            evidence.data.recovered = true;
            evidence.data.recovery_method = 'DEFAULTS';
        }
        const data_quality = {
            source_type: recovered ? 'ESTIMATED' : 'MOCK',
            freshness_seconds: 0,
            confidence: recovered ? 0.3 : 0.1,
            coverage: recovered ? 0.5 : 0.0,
            retrieved_at: new Date().toISOString(),
            fallback_info: {
                original_source: agent,
                fallback_reason: this.getErrorMessage(errorType),
                quality_impact: this.getQualityImpact(errorType),
            },
        };
        const shouldWarnUser = !recovered || errorType === DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE;
        const userWarning = shouldWarnUser ? this.getUserFriendlyMessage(agent, errorType) : undefined;
        return {
            recovered,
            data,
            data_quality,
            evidence,
            shouldWarnUser,
            userWarning,
        };
    }
    async executeWithRetry(agent, operation, fn, fallbackData, customStrategy) {
        const strategy = { ...this.defaultStrategies[agent], ...customStrategy };
        const maxRetries = strategy.retry ? (strategy.retryCount || 2) : 0;
        const retryDelay = strategy.retryDelay || 1000;
        let lastError;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const data = await fn();
                return {
                    data,
                    evidence: {
                        evidence_id: `success_${agent}_${Date.now()}`,
                        source: `${agent}.${operation}`,
                        timestamp: new Date().toISOString(),
                        data: { attempts: attempt + 1 },
                    },
                    data_quality: {
                        source_type: 'REALTIME_API',
                        freshness_seconds: 0,
                        confidence: 0.9,
                        coverage: 1.0,
                        retrieved_at: new Date().toISOString(),
                    },
                };
            }
            catch (error) {
                lastError = error;
                this.logger.debug(`[${agent}.${operation}] Attempt ${attempt + 1} failed: ${error.message}`);
                if (attempt < maxRetries) {
                    await this.delay(retryDelay * Math.pow(2, attempt));
                }
            }
        }
        const result = await this.handleError(agent, operation, lastError, fallbackData, customStrategy);
        if (!result.recovered || result.data === undefined) {
            throw lastError;
        }
        return {
            data: result.data,
            evidence: result.evidence,
            data_quality: result.data_quality,
        };
    }
    getErrorMessage(type) {
        const messages = {
            [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: 'Data source temporarily unavailable',
            [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: 'Request timed out',
            [DomainAgentErrorType.DATA_FORMAT_ERROR]: 'Data format error',
            [DomainAgentErrorType.DATA_VALIDATION_ERROR]: 'Data validation failed',
            [DomainAgentErrorType.QUOTA_EXCEEDED]: 'API quota exceeded',
            [DomainAgentErrorType.PERMISSION_DENIED]: 'Permission denied',
            [DomainAgentErrorType.UNKNOWN_ERROR]: 'Unknown error occurred',
        };
        return messages[type];
    }
    getQualityImpact(type) {
        const impacts = {
            [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: 'SIGNIFICANT',
            [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: 'MODERATE',
            [DomainAgentErrorType.DATA_FORMAT_ERROR]: 'MODERATE',
            [DomainAgentErrorType.DATA_VALIDATION_ERROR]: 'MINOR',
            [DomainAgentErrorType.QUOTA_EXCEEDED]: 'MODERATE',
            [DomainAgentErrorType.PERMISSION_DENIED]: 'SIGNIFICANT',
            [DomainAgentErrorType.UNKNOWN_ERROR]: 'SIGNIFICANT',
        };
        return impacts[type];
    }
    getUserFriendlyMessage(agent, type) {
        var _a;
        const agentMessages = {
            GeoAgent: {
                [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '地形数据暂时不可用，使用估算值',
                [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '地形数据获取超时，使用缓存数据',
                [DomainAgentErrorType.DATA_FORMAT_ERROR]: '地形数据格式异常',
                [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '地形数据验证失败',
                [DomainAgentErrorType.QUOTA_EXCEEDED]: '地形数据请求配额已用尽',
                [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问地形数据',
                [DomainAgentErrorType.UNKNOWN_ERROR]: '地形分析遇到未知问题',
            },
            WeatherAgent: {
                [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '天气数据暂时不可用，使用历史平均值',
                [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '天气数据获取超时',
                [DomainAgentErrorType.DATA_FORMAT_ERROR]: '天气数据格式异常',
                [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '天气数据验证失败',
                [DomainAgentErrorType.QUOTA_EXCEEDED]: '天气 API 请求配额已用尽',
                [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问天气数据',
                [DomainAgentErrorType.UNKNOWN_ERROR]: '天气预报遇到未知问题',
            },
            CostAgent: {
                [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '价格数据暂时不可用，使用估算值',
                [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '价格数据获取超时',
                [DomainAgentErrorType.DATA_FORMAT_ERROR]: '价格数据格式异常',
                [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '价格数据验证失败',
                [DomainAgentErrorType.QUOTA_EXCEEDED]: '价格 API 请求配额已用尽',
                [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问价格数据',
                [DomainAgentErrorType.UNKNOWN_ERROR]: '成本估算遇到未知问题',
            },
            ExperienceAgent: {
                [DomainAgentErrorType.DATA_SOURCE_UNAVAILABLE]: '体验分析服务暂时不可用',
                [DomainAgentErrorType.DATA_SOURCE_TIMEOUT]: '体验分析超时',
                [DomainAgentErrorType.DATA_FORMAT_ERROR]: '体验数据格式异常',
                [DomainAgentErrorType.DATA_VALIDATION_ERROR]: '体验数据验证失败',
                [DomainAgentErrorType.QUOTA_EXCEEDED]: '体验分析请求配额已用尽',
                [DomainAgentErrorType.PERMISSION_DENIED]: '无权访问体验分析',
                [DomainAgentErrorType.UNKNOWN_ERROR]: '体验分析遇到未知问题',
            },
        };
        return ((_a = agentMessages[agent]) === null || _a === void 0 ? void 0 : _a[type]) || `${agent} 遇到问题：${this.getErrorMessage(type)}`;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
exports.DomainAgentErrorHandler = DomainAgentErrorHandler;
exports.DomainAgentErrorHandler = DomainAgentErrorHandler = DomainAgentErrorHandler_1 = __decorate([
    (0, common_1.Injectable)()
], DomainAgentErrorHandler);
//# sourceMappingURL=domain-agent-error-handler.service.js.map