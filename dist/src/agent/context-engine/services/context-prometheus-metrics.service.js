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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextPrometheusMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prom_client_1 = require("prom-client");
let ContextPrometheusMetricsService = class ContextPrometheusMetricsService {
    constructor() {
        this.registry = new prom_client_1.Registry();
    }
    async onModuleInit() {
        this.initializeContextBuildMetrics();
        this.initializeCacheMetrics();
        this.initializeTokenMetrics();
        this.initializeBlockMetrics();
        this.initializeContextLearningMetrics();
    }
    initializeContextBuildMetrics() {
        this.contextBuildCounter = new prom_client_1.Counter({
            name: 'context_package_build_total',
            help: 'Total number of Context Package builds',
            labelNames: ['phase', 'agent'],
            registers: [this.registry],
        });
        this.contextBuildDuration = new prom_client_1.Histogram({
            name: 'context_package_build_duration_ms',
            help: 'Context Package build duration in milliseconds',
            labelNames: ['phase', 'agent', 'cache_level'],
            buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
            registers: [this.registry],
        });
        this.contextBuildCacheHitCounter = new prom_client_1.Counter({
            name: 'context_package_build_cache_hits_total',
            help: 'Total number of Context Package cache hits',
            labelNames: ['phase', 'agent', 'cache_level'],
            registers: [this.registry],
        });
        this.contextBuildCacheMissCounter = new prom_client_1.Counter({
            name: 'context_package_build_cache_misses_total',
            help: 'Total number of Context Package cache misses',
            labelNames: ['phase', 'agent'],
            registers: [this.registry],
        });
    }
    initializeCacheMetrics() {
        this.contextCacheHitsCounter = new prom_client_1.Counter({
            name: 'context_cache_hits_total',
            help: 'Total number of Context cache hits',
            labelNames: ['cache_level'],
            registers: [this.registry],
        });
        this.contextCacheMissesCounter = new prom_client_1.Counter({
            name: 'context_cache_misses_total',
            help: 'Total number of Context cache misses',
            labelNames: ['cache_level'],
            registers: [this.registry],
        });
        this.contextCacheSizeGauge = new prom_client_1.Gauge({
            name: 'context_cache_size',
            help: 'Current number of items in Context cache',
            labelNames: ['cache_level'],
            registers: [this.registry],
        });
        this.contextCacheOperationDuration = new prom_client_1.Histogram({
            name: 'context_cache_operation_duration_ms',
            help: 'Context cache operation duration in milliseconds',
            labelNames: ['cache_level', 'operation'],
            buckets: [1, 5, 10, 25, 50, 100, 250, 500],
            registers: [this.registry],
        });
    }
    initializeTokenMetrics() {
        this.contextTokenUsageGauge = new prom_client_1.Gauge({
            name: 'context_token_usage',
            help: 'Current Token usage in Context Package',
            labelNames: ['phase', 'agent'],
            registers: [this.registry],
        });
        this.contextTokenBudgetGauge = new prom_client_1.Gauge({
            name: 'context_token_budget',
            help: 'Token budget for Context Package',
            labelNames: ['phase', 'agent'],
            registers: [this.registry],
        });
        this.contextTokenOverBudgetCounter = new prom_client_1.Counter({
            name: 'context_token_over_budget_total',
            help: 'Total number of Context Packages that exceeded token budget',
            labelNames: ['phase', 'agent'],
            registers: [this.registry],
        });
    }
    initializeBlockMetrics() {
        this.contextBlockCountGauge = new prom_client_1.Gauge({
            name: 'context_block_count',
            help: 'Number of blocks in Context Package',
            labelNames: ['phase', 'agent', 'visibility'],
            registers: [this.registry],
        });
        this.contextBlockTypeCounter = new prom_client_1.Counter({
            name: 'context_block_type_total',
            help: 'Total number of blocks by type',
            labelNames: ['phase', 'agent', 'block_type'],
            registers: [this.registry],
        });
        this.contextBlockPriorityDistribution = new prom_client_1.Histogram({
            name: 'context_block_priority',
            help: 'Distribution of block priorities',
            labelNames: ['phase', 'agent'],
            buckets: [0, 30, 50, 70, 80, 90, 100],
            registers: [this.registry],
        });
    }
    recordBuild(phase, agent, buildTimeMs, cacheHit, cacheLevel) {
        this.contextBuildCounter.inc({ phase, agent });
        this.contextBuildDuration.observe({ phase, agent, cache_level: cacheLevel || 'none' }, buildTimeMs);
        if (cacheHit && cacheLevel) {
            this.contextBuildCacheHitCounter.inc({ phase, agent, cache_level: cacheLevel });
        }
        else {
            this.contextBuildCacheMissCounter.inc({ phase, agent });
        }
    }
    recordCacheOperation(cacheLevel, operation, durationMs, hit) {
        this.contextCacheOperationDuration.observe({ cache_level: cacheLevel, operation }, durationMs);
        if (hit !== undefined) {
            if (hit) {
                this.contextCacheHitsCounter.inc({ cache_level: cacheLevel });
            }
            else {
                this.contextCacheMissesCounter.inc({ cache_level: cacheLevel });
            }
        }
    }
    updateCacheSize(cacheLevel, size) {
        this.contextCacheSizeGauge.set({ cache_level: cacheLevel }, size);
    }
    recordTokenUsage(phase, agent, tokenUsage, tokenBudget) {
        this.contextTokenUsageGauge.set({ phase, agent }, tokenUsage);
        this.contextTokenBudgetGauge.set({ phase, agent }, tokenBudget);
        if (tokenUsage > tokenBudget) {
            this.contextTokenOverBudgetCounter.inc({ phase, agent });
        }
    }
    recordBlockStats(phase, agent, blocks) {
        const publicBlocks = blocks.filter((b) => b.visibility === 'public').length;
        const privateBlocks = blocks.filter((b) => b.visibility === 'private').length;
        this.contextBlockCountGauge.set({ phase, agent, visibility: 'public' }, publicBlocks);
        this.contextBlockCountGauge.set({ phase, agent, visibility: 'private' }, privateBlocks);
        const blockTypeCounts = new Map();
        for (const block of blocks) {
            blockTypeCounts.set(block.type, (blockTypeCounts.get(block.type) || 0) + 1);
            this.contextBlockTypeCounter.inc({ phase, agent, block_type: block.type });
        }
        for (const block of blocks) {
            this.contextBlockPriorityDistribution.observe({ phase, agent }, block.priority);
        }
    }
    async getMetrics() {
        return this.registry.metrics();
    }
    initializeContextLearningMetrics() {
        this.contextLearningEventCounter = new prom_client_1.Counter({
            name: 'context_learning_events_total',
            help: 'Total number of Context Learning events',
            labelNames: ['event_type', 'phase', 'agent'],
            registers: [this.registry],
        });
        this.contextLearningProcessingDuration = new prom_client_1.Histogram({
            name: 'context_learning_processing_duration_ms',
            help: 'Context Learning processing duration in milliseconds',
            labelNames: ['event_type', 'phase', 'agent'],
            buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
            registers: [this.registry],
        });
        this.contextLearningConfidenceGauge = new prom_client_1.Gauge({
            name: 'context_learning_confidence',
            help: 'Context Learning confidence score',
            labelNames: ['phase', 'agent', 'block_key'],
            registers: [this.registry],
        });
        this.contextLearningSampleSizeGauge = new prom_client_1.Gauge({
            name: 'context_learning_sample_size',
            help: 'Context Learning sample size',
            labelNames: ['phase', 'agent', 'block_key'],
            registers: [this.registry],
        });
        this.contextLearningUpdatedPrioritiesCounter = new prom_client_1.Counter({
            name: 'context_learning_updated_priorities_total',
            help: 'Total number of block priorities updated by Context Learning',
            labelNames: ['phase', 'agent', 'block_type'],
            registers: [this.registry],
        });
    }
    recordLearningEvent(eventType, phase, agent, processingTimeMs) {
        this.contextLearningEventCounter.inc({ event_type: eventType, phase, agent });
        this.contextLearningProcessingDuration.observe({ event_type: eventType, phase, agent }, processingTimeMs);
    }
    updateLearningStats(phase, agent, blockKey, confidence, sampleSize) {
        this.contextLearningConfidenceGauge.set({ phase, agent, block_key: blockKey }, confidence);
        this.contextLearningSampleSizeGauge.set({ phase, agent, block_key: blockKey }, sampleSize);
    }
    recordPriorityUpdate(phase, agent, blockType, count = 1) {
        this.contextLearningUpdatedPrioritiesCounter.inc({ phase, agent, block_type: blockType }, count);
    }
    getRegistry() {
        return this.registry;
    }
};
exports.ContextPrometheusMetricsService = ContextPrometheusMetricsService;
exports.ContextPrometheusMetricsService = ContextPrometheusMetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ContextPrometheusMetricsService);
//# sourceMappingURL=context-prometheus-metrics.service.js.map