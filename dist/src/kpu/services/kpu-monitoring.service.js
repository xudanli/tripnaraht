"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var KPUMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KPUMonitoringService = void 0;
const common_1 = require("@nestjs/common");
let KPUMonitoringService = KPUMonitoringService_1 = class KPUMonitoringService {
    constructor() {
        this.logger = new common_1.Logger(KPUMonitoringService_1.name);
        this.metrics = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0,
            avgValidationLatency: 0,
            avgValidationScore: 0,
            totalRetrievals: 0,
            avgRetrievalLatency: 0,
            avgCandidatesPerRetrieval: 0,
            totalGenerations: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            avgGenerationLatency: 0,
            retryCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            cacheHitRate: 0,
            totalLlmCalls: 0,
            successfulLlmCalls: 0,
            failedLlmCalls: 0,
            avgLlmLatency: 0,
        };
        this.validationLatencies = [];
        this.retrievalLatencies = [];
        this.generationLatencies = [];
        this.validationScores = [];
        this.llmLatencies = [];
    }
    recordValidation(success, latency, score) {
        this.metrics.totalValidations++;
        if (success) {
            this.metrics.successfulValidations++;
        }
        else {
            this.metrics.failedValidations++;
        }
        this.validationLatencies.push(latency);
        if (score !== undefined) {
            this.validationScores.push(score);
        }
        this.updateAvgValidationLatency();
        this.updateAvgValidationScore();
    }
    recordRetrieval(latency, candidateCount) {
        this.metrics.totalRetrievals++;
        this.retrievalLatencies.push(latency);
        this.metrics.avgCandidatesPerRetrieval =
            (this.metrics.avgCandidatesPerRetrieval * (this.metrics.totalRetrievals - 1) + candidateCount) /
                this.metrics.totalRetrievals;
        this.updateAvgRetrievalLatency();
    }
    recordGeneration(success, latency, retried = false) {
        this.metrics.totalGenerations++;
        if (success) {
            this.metrics.successfulGenerations++;
        }
        else {
            this.metrics.failedGenerations++;
        }
        if (retried) {
            this.metrics.retryCount++;
        }
        this.generationLatencies.push(latency);
        this.updateAvgGenerationLatency();
    }
    recordCacheHit() {
        this.metrics.cacheHits++;
        this.updateCacheHitRate();
    }
    recordCacheMiss() {
        this.metrics.cacheMisses++;
        this.updateCacheHitRate();
    }
    recordLlmCall(success, latency) {
        this.metrics.totalLlmCalls++;
        if (success) {
            this.metrics.successfulLlmCalls++;
        }
        else {
            this.metrics.failedLlmCalls++;
        }
        this.llmLatencies.push(latency);
        this.updateAvgLlmLatency();
    }
    getMetrics() {
        return { ...this.metrics };
    }
    resetMetrics() {
        this.metrics = {
            totalValidations: 0,
            successfulValidations: 0,
            failedValidations: 0,
            avgValidationLatency: 0,
            avgValidationScore: 0,
            totalRetrievals: 0,
            avgRetrievalLatency: 0,
            avgCandidatesPerRetrieval: 0,
            totalGenerations: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            avgGenerationLatency: 0,
            retryCount: 0,
            cacheHits: 0,
            cacheMisses: 0,
            cacheHitRate: 0,
            totalLlmCalls: 0,
            successfulLlmCalls: 0,
            failedLlmCalls: 0,
            avgLlmLatency: 0,
        };
        this.validationLatencies = [];
        this.retrievalLatencies = [];
        this.generationLatencies = [];
        this.validationScores = [];
        this.llmLatencies = [];
    }
    getMetricsSummary() {
        const m = this.metrics;
        return `
KPU指标摘要:
- 验证总数: ${m.totalValidations}
- 验证成功率: ${m.totalValidations > 0 ? (m.successfulValidations / m.totalValidations * 100).toFixed(2) : 0}%
- 平均验证延迟: ${m.avgValidationLatency.toFixed(0)}ms
- 平均验证得分: ${m.avgValidationScore.toFixed(2)}
- 检索总数: ${m.totalRetrievals}
- 平均检索延迟: ${m.avgRetrievalLatency.toFixed(0)}ms
- 生成总数: ${m.totalGenerations}
- 生成成功率: ${m.totalGenerations > 0 ? (m.successfulGenerations / m.totalGenerations * 100).toFixed(2) : 0}%
- 重试次数: ${m.retryCount}
- 缓存命中率: ${m.cacheHitRate.toFixed(2)}%
- LLM调用总数: ${m.totalLlmCalls}
- LLM调用成功率: ${m.totalLlmCalls > 0 ? (m.successfulLlmCalls / m.totalLlmCalls * 100).toFixed(2) : 0}%
- 平均LLM延迟: ${m.avgLlmLatency.toFixed(0)}ms
    `.trim();
    }
    updateAvgValidationLatency() {
        if (this.validationLatencies.length > 0) {
            const sum = this.validationLatencies.reduce((a, b) => a + b, 0);
            this.metrics.avgValidationLatency = sum / this.validationLatencies.length;
        }
    }
    updateAvgRetrievalLatency() {
        if (this.retrievalLatencies.length > 0) {
            const sum = this.retrievalLatencies.reduce((a, b) => a + b, 0);
            this.metrics.avgRetrievalLatency = sum / this.retrievalLatencies.length;
        }
    }
    updateAvgGenerationLatency() {
        if (this.generationLatencies.length > 0) {
            const sum = this.generationLatencies.reduce((a, b) => a + b, 0);
            this.metrics.avgGenerationLatency = sum / this.generationLatencies.length;
        }
    }
    updateAvgValidationScore() {
        if (this.validationScores.length > 0) {
            const sum = this.validationScores.reduce((a, b) => a + b, 0);
            this.metrics.avgValidationScore = sum / this.validationScores.length;
        }
    }
    updateCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        if (total > 0) {
            this.metrics.cacheHitRate = (this.metrics.cacheHits / total) * 100;
        }
    }
    updateAvgLlmLatency() {
        if (this.llmLatencies.length > 0) {
            const sum = this.llmLatencies.reduce((a, b) => a + b, 0);
            this.metrics.avgLlmLatency = sum / this.llmLatencies.length;
        }
    }
};
exports.KPUMonitoringService = KPUMonitoringService;
exports.KPUMonitoringService = KPUMonitoringService = KPUMonitoringService_1 = __decorate([
    (0, common_1.Injectable)()
], KPUMonitoringService);
//# sourceMappingURL=kpu-monitoring.service.js.map