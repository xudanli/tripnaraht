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
exports.RagMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prom_client_1 = require("prom-client");
let RagMetricsService = class RagMetricsService {
    constructor() {
        this.registry = new prom_client_1.Registry();
    }
    async onModuleInit() {
        this.initializeCacheMetrics();
        this.initializeRetryMetrics();
        this.initializeParallelMetrics();
        this.initializeApiMetrics();
        this.initializeRagMetrics();
    }
    initializeCacheMetrics() {
        this.cacheHitsCounter = new prom_client_1.Counter({
            name: 'rag_cache_hits_total',
            help: 'Total number of cache hits',
            labelNames: ['cache_type'],
            registers: [this.registry],
        });
        this.cacheMissesCounter = new prom_client_1.Counter({
            name: 'rag_cache_misses_total',
            help: 'Total number of cache misses',
            labelNames: ['cache_type'],
            registers: [this.registry],
        });
        this.cacheSizeGauge = new prom_client_1.Gauge({
            name: 'rag_cache_size',
            help: 'Current number of items in cache',
            labelNames: ['cache_type'],
            registers: [this.registry],
        });
        this.cacheOperationDuration = new prom_client_1.Histogram({
            name: 'rag_cache_operation_duration_ms',
            help: 'Cache operation duration in milliseconds',
            labelNames: ['cache_type', 'operation'],
            buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
            registers: [this.registry],
        });
    }
    initializeRetryMetrics() {
        this.retryAttemptsCounter = new prom_client_1.Counter({
            name: 'rag_retry_attempts_total',
            help: 'Total number of retry attempts',
            labelNames: ['retry_type'],
            registers: [this.registry],
        });
        this.retrySuccessCounter = new prom_client_1.Counter({
            name: 'rag_retry_success_total',
            help: 'Total number of successful retries',
            labelNames: ['retry_type'],
            registers: [this.registry],
        });
        this.retryFailureCounter = new prom_client_1.Counter({
            name: 'rag_retry_failure_total',
            help: 'Total number of failed retries (after all attempts)',
            labelNames: ['retry_type'],
            registers: [this.registry],
        });
        this.retryAttemptsHistogram = new prom_client_1.Histogram({
            name: 'rag_retry_attempts_count',
            help: 'Distribution of retry attempt counts',
            labelNames: ['retry_type'],
            buckets: [1, 2, 3, 4, 5, 10],
            registers: [this.registry],
        });
    }
    initializeParallelMetrics() {
        this.parallelTasksCounter = new prom_client_1.Counter({
            name: 'rag_parallel_tasks_total',
            help: 'Total number of parallel tasks executed',
            registers: [this.registry],
        });
        this.parallelTaskSuccessCounter = new prom_client_1.Counter({
            name: 'rag_parallel_task_success_total',
            help: 'Total number of successful parallel tasks',
            registers: [this.registry],
        });
        this.parallelTaskFailureCounter = new prom_client_1.Counter({
            name: 'rag_parallel_task_failure_total',
            help: 'Total number of failed parallel tasks',
            registers: [this.registry],
        });
        this.parallelConcurrencyGauge = new prom_client_1.Gauge({
            name: 'rag_parallel_concurrency',
            help: 'Current number of tasks running in parallel',
            registers: [this.registry],
        });
        this.parallelTaskDuration = new prom_client_1.Histogram({
            name: 'rag_parallel_task_duration_ms',
            help: 'Parallel task duration in milliseconds',
            buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
            registers: [this.registry],
        });
    }
    initializeApiMetrics() {
        this.apiCallsCounter = new prom_client_1.Counter({
            name: 'rag_api_calls_total',
            help: 'Total number of external API calls',
            labelNames: ['api_type'],
            registers: [this.registry],
        });
        this.apiCallDuration = new prom_client_1.Histogram({
            name: 'rag_api_call_duration_ms',
            help: 'API call duration in milliseconds',
            labelNames: ['api_type'],
            buckets: [100, 250, 500, 1000, 2000, 5000, 10000],
            registers: [this.registry],
        });
        this.apiErrorsCounter = new prom_client_1.Counter({
            name: 'rag_api_errors_total',
            help: 'Total number of API errors',
            labelNames: ['api_type', 'error_type'],
            registers: [this.registry],
        });
    }
    initializeRagMetrics() {
        this.ragQueryCounter = new prom_client_1.Counter({
            name: 'rag_query_total',
            help: 'Total number of RAG queries',
            labelNames: ['category'],
            registers: [this.registry],
        });
        this.ragQueryDuration = new prom_client_1.Histogram({
            name: 'rag_query_duration_ms',
            help: 'RAG query duration in milliseconds',
            labelNames: ['category'],
            buckets: [50, 100, 250, 500, 1000, 2000, 5000],
            registers: [this.registry],
        });
        this.ragFallbackLevelCounter = new prom_client_1.Counter({
            name: 'rag_fallback_level_total',
            help: 'Count of queries by fallback level',
            labelNames: ['level'],
            registers: [this.registry],
        });
    }
    recordCacheHit(cacheType = 'hybrid') {
        this.cacheHitsCounter.inc({ cache_type: cacheType });
    }
    recordCacheMiss(cacheType = 'hybrid') {
        this.cacheMissesCounter.inc({ cache_type: cacheType });
    }
    updateCacheSize(cacheType, size) {
        this.cacheSizeGauge.set({ cache_type: cacheType }, size);
    }
    recordCacheOperation(cacheType, operation, durationMs) {
        this.cacheOperationDuration.observe({ cache_type: cacheType, operation }, durationMs);
    }
    recordRetry(retryType, attemptCount, success) {
        this.retryAttemptsCounter.inc({ retry_type: retryType }, attemptCount);
        this.retryAttemptsHistogram.observe({ retry_type: retryType }, attemptCount);
        if (success) {
            this.retrySuccessCounter.inc({ retry_type: retryType });
        }
        else {
            this.retryFailureCounter.inc({ retry_type: retryType });
        }
    }
    recordParallelTaskStart(count = 1) {
        this.parallelTasksCounter.inc(count);
        this.parallelConcurrencyGauge.inc(count);
    }
    recordParallelTaskComplete(success, durationMs) {
        this.parallelConcurrencyGauge.dec();
        this.parallelTaskDuration.observe(durationMs);
        if (success) {
            this.parallelTaskSuccessCounter.inc();
        }
        else {
            this.parallelTaskFailureCounter.inc();
        }
    }
    recordApiCall(apiType, durationMs, success, errorType) {
        this.apiCallsCounter.inc({ api_type: apiType });
        this.apiCallDuration.observe({ api_type: apiType }, durationMs);
        if (!success && errorType) {
            this.apiErrorsCounter.inc({ api_type: apiType, error_type: errorType });
        }
    }
    recordRagQuery(category, durationMs, fallbackLevel) {
        this.ragQueryCounter.inc({ category });
        this.ragQueryDuration.observe({ category }, durationMs);
        this.ragFallbackLevelCounter.inc({ level: fallbackLevel });
    }
    async getMetrics() {
        return this.registry.metrics();
    }
    getRegistry() {
        return this.registry;
    }
    resetMetrics() {
        this.registry.resetMetrics();
    }
    async getCacheStats() {
        const metrics = await this.registry.getMetricsAsJSON();
        let hits = 0;
        let misses = 0;
        for (const metric of metrics) {
            if (metric.name === 'rag_cache_hits_total') {
                hits = metric.values.reduce((sum, v) => sum + v.value, 0);
            }
            if (metric.name === 'rag_cache_misses_total') {
                misses = metric.values.reduce((sum, v) => sum + v.value, 0);
            }
        }
        const total = hits + misses;
        const hitRate = total > 0 ? hits / total : 0;
        return { hits, misses, hitRate };
    }
};
exports.RagMetricsService = RagMetricsService;
exports.RagMetricsService = RagMetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RagMetricsService);
//# sourceMappingURL=rag-metrics.service.js.map