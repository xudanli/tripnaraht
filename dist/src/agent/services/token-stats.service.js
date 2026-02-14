"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TokenStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenStatsService = void 0;
const common_1 = require("@nestjs/common");
let TokenStatsService = TokenStatsService_1 = class TokenStatsService {
    constructor() {
        this.logger = new common_1.Logger(TokenStatsService_1.name);
        this.tokenRecords = new Map();
        this.statsCache = {
            subAgent: new Map(),
            taskType: new Map(),
            provider: new Map(),
            lastUpdated: new Date(),
        };
        this.maxRecordsInMemory = 10000;
        this.cacheTTL = 60000;
    }
    async recordTokenUsage(data) {
        try {
            const recordKey = `${data.request_id}_${data.span_id}`;
            this.tokenRecords.set(recordKey, data);
            if (this.tokenRecords.size > this.maxRecordsInMemory) {
                const firstKey = this.tokenRecords.keys().next().value;
                if (firstKey) {
                    this.tokenRecords.delete(firstKey);
                }
            }
            this.updateStatsCache(data);
            this.logger.debug(`[TokenStats] 记录Token使用: ${data.sub_agent}/${data.task_type} | ` +
                `tokens=${data.total_tokens} | provider=${data.provider}`);
        }
        catch (error) {
            this.logger.warn(`[TokenStats] 记录Token使用失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    updateStatsCache(data) {
        this.updateSubAgentStats(data);
        this.updateTaskTypeStats(data);
        this.updateProviderStats(data);
        this.statsCache.lastUpdated = new Date();
    }
    updateSubAgentStats(data) {
        const existing = this.statsCache.subAgent.get(data.sub_agent);
        if (!existing) {
            const stats = {
                sub_agent: data.sub_agent,
                tokens: {
                    total_prompt_tokens: data.prompt_tokens,
                    total_completion_tokens: data.completion_tokens,
                    total_tokens: data.total_tokens,
                    avg_prompt_tokens: data.prompt_tokens,
                    avg_completion_tokens: data.completion_tokens,
                    avg_total_tokens: data.total_tokens,
                    max_tokens: data.total_tokens,
                    min_tokens: data.total_tokens,
                },
                calls: {
                    total_calls: 1,
                    successful_calls: data.success ? 1 : 0,
                    failed_calls: data.success ? 0 : 1,
                    success_rate: data.success ? 1 : 0,
                },
                latency: {
                    avg_latency_ms: data.duration_ms,
                    p50_latency_ms: data.duration_ms,
                    p90_latency_ms: data.duration_ms,
                    p99_latency_ms: data.duration_ms,
                    max_latency_ms: data.duration_ms,
                },
                time_range: {
                    start_time: data.timestamp,
                    end_time: data.timestamp,
                    duration_hours: 0,
                },
            };
            this.statsCache.subAgent.set(data.sub_agent, stats);
        }
        else {
            const totalCalls = existing.calls.total_calls + 1;
            const successfulCalls = existing.calls.successful_calls + (data.success ? 1 : 0);
            existing.tokens.total_prompt_tokens += data.prompt_tokens;
            existing.tokens.total_completion_tokens += data.completion_tokens;
            existing.tokens.total_tokens += data.total_tokens;
            existing.tokens.avg_prompt_tokens = existing.tokens.total_prompt_tokens / totalCalls;
            existing.tokens.avg_completion_tokens = existing.tokens.total_completion_tokens / totalCalls;
            existing.tokens.avg_total_tokens = existing.tokens.total_tokens / totalCalls;
            existing.tokens.max_tokens = Math.max(existing.tokens.max_tokens, data.total_tokens);
            existing.tokens.min_tokens = Math.min(existing.tokens.min_tokens, data.total_tokens);
            existing.calls.total_calls = totalCalls;
            existing.calls.successful_calls = successfulCalls;
            existing.calls.failed_calls = totalCalls - successfulCalls;
            existing.calls.success_rate = successfulCalls / totalCalls;
            const totalLatency = existing.latency.avg_latency_ms * (totalCalls - 1) + data.duration_ms;
            existing.latency.avg_latency_ms = totalLatency / totalCalls;
            existing.latency.max_latency_ms = Math.max(existing.latency.max_latency_ms, data.duration_ms);
            if (new Date(data.timestamp) < new Date(existing.time_range.start_time)) {
                existing.time_range.start_time = data.timestamp;
            }
            if (new Date(data.timestamp) > new Date(existing.time_range.end_time)) {
                existing.time_range.end_time = data.timestamp;
            }
            const durationMs = new Date(existing.time_range.end_time).getTime() -
                new Date(existing.time_range.start_time).getTime();
            existing.time_range.duration_hours = durationMs / (1000 * 60 * 60);
        }
    }
    updateTaskTypeStats(data) {
    }
    updateProviderStats(data) {
    }
    async getSubAgentStats(subAgent, timeRange) {
        const stats = this.statsCache.subAgent.get(subAgent);
        if (!stats) {
            return null;
        }
        return stats;
    }
    async getTaskTypeStats(taskType, timeRange) {
        return null;
    }
    async getTimeSeriesStats(granularity, timeRange) {
        return [];
    }
    async getProviderStats(provider, timeRange) {
        const stats = this.statsCache.provider.get(provider);
        return stats || null;
    }
    async exportStats(format, filters) {
        return '';
    }
    getAllRecords() {
        return Array.from(this.tokenRecords.values());
    }
    clearStats() {
        this.tokenRecords.clear();
        this.statsCache.subAgent.clear();
        this.statsCache.taskType.clear();
        this.statsCache.provider.clear();
        this.statsCache.lastUpdated = new Date();
    }
};
exports.TokenStatsService = TokenStatsService;
exports.TokenStatsService = TokenStatsService = TokenStatsService_1 = __decorate([
    (0, common_1.Injectable)()
], TokenStatsService);
//# sourceMappingURL=token-stats.service.js.map