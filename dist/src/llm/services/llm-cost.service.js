"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var LlmCostService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LlmCostService = void 0;
const common_1 = require("@nestjs/common");
const token_stats_service_1 = require("../../agent/services/token-stats.service");
const llm_request_dto_1 = require("../dto/llm-request.dto");
const DEFAULT_PRICING_CONFIG = [
    {
        provider: llm_request_dto_1.LlmProvider.OPENAI,
        model: 'gpt-4-turbo',
        promptTokensPer1k: 0.01,
        completionTokensPer1k: 0.03,
    },
    {
        provider: llm_request_dto_1.LlmProvider.OPENAI,
        model: 'gpt-4o',
        promptTokensPer1k: 0.005,
        completionTokensPer1k: 0.015,
    },
    {
        provider: llm_request_dto_1.LlmProvider.OPENAI,
        model: 'gpt-4o-mini',
        promptTokensPer1k: 0.00015,
        completionTokensPer1k: 0.0006,
    },
    {
        provider: llm_request_dto_1.LlmProvider.OPENAI,
        model: 'gpt-3.5-turbo',
        promptTokensPer1k: 0.0005,
        completionTokensPer1k: 0.0015,
    },
    {
        provider: llm_request_dto_1.LlmProvider.ANTHROPIC,
        model: 'claude-3-opus-20240229',
        promptTokensPer1k: 0.015,
        completionTokensPer1k: 0.075,
    },
    {
        provider: llm_request_dto_1.LlmProvider.ANTHROPIC,
        model: 'claude-3-sonnet-20240229',
        promptTokensPer1k: 0.003,
        completionTokensPer1k: 0.015,
    },
    {
        provider: llm_request_dto_1.LlmProvider.ANTHROPIC,
        model: 'claude-3-haiku-20240307',
        promptTokensPer1k: 0.00025,
        completionTokensPer1k: 0.00125,
    },
    {
        provider: llm_request_dto_1.LlmProvider.DEEPSEEK,
        model: 'deepseek-chat',
        promptTokensPer1k: 0.00014,
        completionTokensPer1k: 0.00028,
    },
    {
        provider: llm_request_dto_1.LlmProvider.DEEPSEEK,
        model: 'deepseek-coder',
        promptTokensPer1k: 0.00014,
        completionTokensPer1k: 0.00028,
    },
    {
        provider: llm_request_dto_1.LlmProvider.GEMINI,
        model: 'gemini-pro',
        promptTokensPer1k: 0.0005,
        completionTokensPer1k: 0.0015,
    },
    {
        provider: llm_request_dto_1.LlmProvider.GEMINI,
        model: 'gemini-pro-vision',
        promptTokensPer1k: 0.0005,
        completionTokensPer1k: 0.0015,
    },
];
let LlmCostService = LlmCostService_1 = class LlmCostService {
    constructor(tokenStatsService) {
        this.tokenStatsService = tokenStatsService;
        this.logger = new common_1.Logger(LlmCostService_1.name);
    }
    getPricingConfig(provider, model) {
        const exactMatch = DEFAULT_PRICING_CONFIG.find((p) => p.provider === provider && p.model === model);
        if (exactMatch) {
            return exactMatch;
        }
        const providerMatch = DEFAULT_PRICING_CONFIG.find((p) => p.provider === provider);
        if (providerMatch) {
            this.logger.warn(`未找到精确的定价配置: provider=${provider}, model=${model}，使用提供商默认配置`);
            return providerMatch;
        }
        const defaultConfig = DEFAULT_PRICING_CONFIG.find((p) => p.provider === llm_request_dto_1.LlmProvider.DEEPSEEK);
        this.logger.warn(`未找到定价配置: provider=${provider}, model=${model}，使用默认配置（DeepSeek）`);
        return defaultConfig || null;
    }
    calculateCost(provider, model, promptTokens, completionTokens) {
        const pricing = this.getPricingConfig(provider, model);
        if (!pricing) {
            return 0;
        }
        const promptCost = (promptTokens / 1000) * pricing.promptTokensPer1k;
        const completionCost = (completionTokens / 1000) * pricing.completionTokensPer1k;
        return promptCost + completionCost;
    }
    async getCostStats(options) {
        const allRecords = this.tokenStatsService.getAllRecords();
        let filteredRecords = allRecords;
        if (options.timeRange) {
            filteredRecords = filteredRecords.filter((r) => new Date(r.timestamp) >= options.timeRange.start &&
                new Date(r.timestamp) <= options.timeRange.end);
        }
        if (options.subAgent) {
            filteredRecords = filteredRecords.filter((r) => r.sub_agent === options.subAgent);
        }
        if (options.provider) {
            filteredRecords = filteredRecords.filter((r) => r.provider === options.provider);
        }
        let totalCost = 0;
        const byProvider = {};
        const bySubAgent = {};
        const breakdownMap = {};
        for (const record of filteredRecords) {
            const cost = this.calculateCost(record.provider, record.model || 'unknown', record.prompt_tokens, record.completion_tokens);
            totalCost += cost;
            const providerKey = record.provider;
            byProvider[providerKey] = (byProvider[providerKey] || 0) + cost;
            const subAgentKey = record.sub_agent;
            bySubAgent[subAgentKey] = (bySubAgent[subAgentKey] || 0) + cost;
            const breakdownKey = `${record.provider}:${record.model || 'unknown'}`;
            if (!breakdownMap[breakdownKey]) {
                breakdownMap[breakdownKey] = {
                    provider: record.provider,
                    model: record.model || 'unknown',
                    calls: 0,
                    tokens: 0,
                    cost: 0,
                };
            }
            breakdownMap[breakdownKey].calls += 1;
            breakdownMap[breakdownKey].tokens += record.total_tokens;
            breakdownMap[breakdownKey].cost += cost;
        }
        const breakdown = Object.values(breakdownMap);
        const result = {
            totalCost: parseFloat(totalCost.toFixed(6)),
            currency: 'USD',
            breakdown,
        };
        if (Object.keys(byProvider).length > 0) {
            result.byProvider = byProvider;
        }
        if (Object.keys(bySubAgent).length > 0) {
            result.bySubAgent = bySubAgent;
        }
        if (options.timeRange) {
            result.timeRange = {
                start: options.timeRange.start.toISOString(),
                end: options.timeRange.end.toISOString(),
            };
        }
        return result;
    }
};
exports.LlmCostService = LlmCostService;
exports.LlmCostService = LlmCostService = LlmCostService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [token_stats_service_1.TokenStatsService])
], LlmCostService);
//# sourceMappingURL=llm-cost.service.js.map