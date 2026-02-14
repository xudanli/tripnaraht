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
var RAGMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let RAGMonitoringService = RAGMonitoringService_1 = class RAGMonitoringService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(RAGMonitoringService_1.name);
        this.retrievalLatencies = [];
        this.embeddingLatencies = [];
        this.errors = [];
        this.qualityEvents = [];
        this.embeddingCalls = 0;
        this.embeddingTokens = 0;
        this.embeddingCachedCalls = 0;
        this.llmCalls = 0;
        this.llmTokens = 0;
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.MAX_SAMPLES = 1000;
        this.WINDOW_SIZE_MS = 60000;
    }
    recordRetrieval(event) {
        this.retrievalLatencies.push(event.latency);
        if (this.retrievalLatencies.length > this.MAX_SAMPLES) {
            this.retrievalLatencies.shift();
        }
        if (event.embeddingLatency !== undefined) {
            this.embeddingLatencies.push(event.embeddingLatency);
            if (this.embeddingLatencies.length > this.MAX_SAMPLES) {
                this.embeddingLatencies.shift();
            }
        }
        if (event.error) {
            this.errors.push({
                timestamp: Date.now(),
                error: event.error,
            });
            const oneHourAgo = Date.now() - 3600000;
            while (this.errors.length > 0 && this.errors[0].timestamp < oneHourAgo) {
                this.errors.shift();
            }
        }
        if (event.cacheHit === true) {
            this.cacheHits++;
        }
        else if (event.cacheHit === false) {
            this.cacheMisses++;
        }
        this.saveToQueryHistory(event).catch(err => {
            this.logger.warn(`保存查询历史失败: ${err.message}`);
        });
    }
    recordQuality(event) {
        this.qualityEvents.push(event);
        if (this.qualityEvents.length > this.MAX_SAMPLES) {
            this.qualityEvents.shift();
        }
    }
    recordEmbeddingCall(tokens, cached = false) {
        this.embeddingCalls++;
        this.embeddingTokens += tokens;
        if (cached) {
            this.embeddingCachedCalls++;
        }
    }
    recordLLMCall(tokens) {
        this.llmCalls++;
        this.llmTokens += tokens;
    }
    recordCacheStats(hits, misses) {
        this.cacheHits = hits;
        this.cacheMisses = misses;
    }
    getPerformanceMetrics() {
        const retrievalLatency = this.calculatePercentiles(this.retrievalLatencies);
        const embeddingLatency = this.calculatePercentiles(this.embeddingLatencies);
        const oneMinuteAgo = Date.now() - this.WINDOW_SIZE_MS;
        const recentRequests = this.retrievalLatencies.filter((_, index) => {
            return index >= this.retrievalLatencies.length - Math.min(100, this.retrievalLatencies.length);
        });
        const qps = recentRequests.length / (this.WINDOW_SIZE_MS / 1000);
        const totalErrors = this.errors.length;
        const totalRequests = this.retrievalLatencies.length;
        const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
        return {
            retrievalLatency: {
                ...retrievalLatency,
                count: this.retrievalLatencies.length,
            },
            embeddingLatency: {
                ...embeddingLatency,
                count: this.embeddingLatencies.length,
            },
            throughput: {
                qps: Math.round(qps * 100) / 100,
                totalRequests: this.retrievalLatencies.length,
                timeWindow: this.WINDOW_SIZE_MS / 1000,
            },
            errorRate: {
                totalErrors,
                totalRequests,
                rate: Math.round(errorRate * 10000) / 100,
            },
        };
    }
    getQualityMetrics() {
        if (this.qualityEvents.length === 0) {
            return {
                recallAtK: { k1: 0, k5: 0, k10: 0, count: 0 },
                mrr: { value: 0, count: 0 },
                ndcgAtK: { k1: 0, k5: 0, k10: 0, count: 0 },
            };
        }
        const recallAt1 = this.calculateRecallAtK(this.qualityEvents, 1);
        const recallAt5 = this.calculateRecallAtK(this.qualityEvents, 5);
        const recallAt10 = this.calculateRecallAtK(this.qualityEvents, 10);
        const mrr = this.calculateMRR(this.qualityEvents);
        const ndcgAt1 = this.calculateNDCGAtK(this.qualityEvents, 1);
        const ndcgAt5 = this.calculateNDCGAtK(this.qualityEvents, 5);
        const ndcgAt10 = this.calculateNDCGAtK(this.qualityEvents, 10);
        return {
            recallAtK: {
                k1: Math.round(recallAt1 * 10000) / 100,
                k5: Math.round(recallAt5 * 10000) / 100,
                k10: Math.round(recallAt10 * 10000) / 100,
                count: this.qualityEvents.length,
            },
            mrr: {
                value: Math.round(mrr * 10000) / 100,
                count: this.qualityEvents.length,
            },
            ndcgAtK: {
                k1: Math.round(ndcgAt1 * 10000) / 100,
                k5: Math.round(ndcgAt5 * 10000) / 100,
                k10: Math.round(ndcgAt10 * 10000) / 100,
                count: this.qualityEvents.length,
            },
        };
    }
    getCostMetrics() {
        const embeddingCostPerToken = 0.02 / 1000000;
        const embeddingCost = this.embeddingTokens * embeddingCostPerToken;
        const llmInputCost = (this.llmTokens * 0.5) * (0.15 / 1000000);
        const llmOutputCost = (this.llmTokens * 0.5) * (0.60 / 1000000);
        const llmCost = llmInputCost + llmOutputCost;
        return {
            embeddingCost: {
                totalCalls: this.embeddingCalls,
                totalTokens: this.embeddingTokens,
                estimatedCost: Math.round(embeddingCost * 1000000) / 1000000,
                cachedCalls: this.embeddingCachedCalls,
            },
            llmCost: {
                totalCalls: this.llmCalls,
                totalTokens: this.llmTokens,
                estimatedCost: Math.round(llmCost * 1000000) / 1000000,
            },
        };
    }
    getCacheMetrics() {
        const total = this.cacheHits + this.cacheMisses;
        const hitRate = total > 0 ? this.cacheHits / total : 0;
        return {
            embeddingCache: {
                hits: this.cacheHits,
                misses: this.cacheMisses,
                hitRate: Math.round(hitRate * 10000) / 100,
                size: 0,
            },
        };
    }
    getAllMetrics() {
        return {
            performance: this.getPerformanceMetrics(),
            quality: this.getQualityMetrics(),
            cost: this.getCostMetrics(),
            cache: this.getCacheMetrics(),
            timestamp: new Date(),
        };
    }
    resetMetrics() {
        this.retrievalLatencies.length = 0;
        this.embeddingLatencies.length = 0;
        this.errors.length = 0;
        this.qualityEvents.length = 0;
        this.embeddingCalls = 0;
        this.embeddingTokens = 0;
        this.embeddingCachedCalls = 0;
        this.llmCalls = 0;
        this.llmTokens = 0;
        this.cacheHits = 0;
        this.cacheMisses = 0;
        this.logger.log('RAG监控指标已重置');
    }
    calculatePercentiles(values) {
        if (values.length === 0) {
            return { p50: 0, p95: 0, p99: 0, avg: 0 };
        }
        const sorted = [...values].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
        return { p50, p95, p99, avg };
    }
    calculateRecallAtK(events, k) {
        if (events.length === 0)
            return 0;
        const recalls = events.map(event => {
            const retrieved = new Set(event.retrievedIds.slice(0, k));
            const groundTruth = new Set(event.groundTruthIds);
            let hits = 0;
            for (const id of groundTruth) {
                if (retrieved.has(id)) {
                    hits++;
                }
            }
            return groundTruth.size > 0 ? hits / groundTruth.size : 0;
        });
        return recalls.reduce((sum, r) => sum + r, 0) / recalls.length;
    }
    calculateMRR(events) {
        if (events.length === 0)
            return 0;
        const reciprocalRanks = events.map(event => {
            const groundTruth = new Set(event.groundTruthIds);
            for (let i = 0; i < event.retrievedIds.length; i++) {
                if (groundTruth.has(event.retrievedIds[i])) {
                    return 1 / (i + 1);
                }
            }
            return 0;
        });
        return reciprocalRanks.reduce((sum, rr) => sum + rr, 0) / reciprocalRanks.length;
    }
    calculateNDCGAtK(events, k) {
        if (events.length === 0)
            return 0;
        const ndcgs = events.map(event => {
            const retrieved = event.retrievedIds.slice(0, k);
            const groundTruth = new Set(event.groundTruthIds);
            let dcg = 0;
            for (let i = 0; i < retrieved.length; i++) {
                const relevance = groundTruth.has(retrieved[i]) ? 1 : 0;
                dcg += relevance / Math.log2(i + 2);
            }
            const idealRelevance = Math.min(k, groundTruth.size);
            let idcg = 0;
            for (let i = 0; i < idealRelevance; i++) {
                idcg += 1 / Math.log2(i + 2);
            }
            return idcg > 0 ? dcg / idcg : 0;
        });
        return ndcgs.reduce((sum, ndcg) => sum + ndcg, 0) / ndcgs.length;
    }
    async saveToQueryHistory(event) {
        try {
            await this.prisma.queryHistory.create({
                data: {
                    query: event.query,
                    retrievedChunks: [],
                    executionTimeMs: event.latency,
                    avgCredibility: 0,
                },
            });
        }
        catch (error) {
            this.logger.debug(`保存查询历史失败: ${error.message}`);
        }
    }
};
exports.RAGMonitoringService = RAGMonitoringService;
exports.RAGMonitoringService = RAGMonitoringService = RAGMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RAGMonitoringService);
//# sourceMappingURL=rag-monitoring.service.js.map