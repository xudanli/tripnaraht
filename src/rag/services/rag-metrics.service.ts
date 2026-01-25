// src/rag/services/rag-metrics.service.ts
/**
 * RAG Prometheus 监控指标服务
 *
 * 收集 Phase 5.2 服务的关键指标：
 * - 缓存性能（命中率、大小、延迟）
 * - 重试统计（成功率、平均重试次数）
 * - 并行执行（并发度、任务成功率）
 * - API调用（延迟、错误率）
 *
 * 使用方式:
 * ```typescript
 * // 记录缓存命中
 * this.ragMetrics.recordCacheHit('redis');
 *
 * // 记录API调用
 * this.ragMetrics.recordApiCall('weather', 250, true);
 *
 * // 记录重试
 * this.ragMetrics.recordRetry('api', 3, true);
 * ```
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

export type CacheType = 'redis' | 'memory' | 'hybrid';
export type RetryType = 'api' | 'db' | 'generic';
export type ApiType = 'weather' | 'places' | 'web_browse' | 'other';

@Injectable()
export class RagMetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // 缓存指标
  private cacheHitsCounter!: Counter;
  private cacheMissesCounter!: Counter;
  private cacheSizeGauge!: Gauge;
  private cacheOperationDuration!: Histogram;

  // 重试指标
  private retryAttemptsCounter!: Counter;
  private retrySuccessCounter!: Counter;
  private retryFailureCounter!: Counter;
  private retryAttemptsHistogram!: Histogram;

  // 并行执行指标
  private parallelTasksCounter!: Counter;
  private parallelTaskSuccessCounter!: Counter;
  private parallelTaskFailureCounter!: Counter;
  private parallelConcurrencyGauge!: Gauge;
  private parallelTaskDuration!: Histogram;

  // API调用指标
  private apiCallsCounter!: Counter;
  private apiCallDuration!: Histogram;
  private apiErrorsCounter!: Counter;

  // RAG查询指标
  private ragQueryCounter!: Counter;
  private ragQueryDuration!: Histogram;
  private ragFallbackLevelCounter!: Counter;

  constructor() {
    this.registry = new Registry();
  }

  async onModuleInit() {
    this.initializeCacheMetrics();
    this.initializeRetryMetrics();
    this.initializeParallelMetrics();
    this.initializeApiMetrics();
    this.initializeRagMetrics();
  }

  /**
   * 初始化缓存指标
   */
  private initializeCacheMetrics() {
    this.cacheHitsCounter = new Counter({
      name: 'rag_cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cache_type'], // redis, memory, hybrid
      registers: [this.registry],
    });

    this.cacheMissesCounter = new Counter({
      name: 'rag_cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    this.cacheSizeGauge = new Gauge({
      name: 'rag_cache_size',
      help: 'Current number of items in cache',
      labelNames: ['cache_type'],
      registers: [this.registry],
    });

    this.cacheOperationDuration = new Histogram({
      name: 'rag_cache_operation_duration_ms',
      help: 'Cache operation duration in milliseconds',
      labelNames: ['cache_type', 'operation'], // get, set, del
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });
  }

  /**
   * 初始化重试指标
   */
  private initializeRetryMetrics() {
    this.retryAttemptsCounter = new Counter({
      name: 'rag_retry_attempts_total',
      help: 'Total number of retry attempts',
      labelNames: ['retry_type'], // api, db, generic
      registers: [this.registry],
    });

    this.retrySuccessCounter = new Counter({
      name: 'rag_retry_success_total',
      help: 'Total number of successful retries',
      labelNames: ['retry_type'],
      registers: [this.registry],
    });

    this.retryFailureCounter = new Counter({
      name: 'rag_retry_failure_total',
      help: 'Total number of failed retries (after all attempts)',
      labelNames: ['retry_type'],
      registers: [this.registry],
    });

    this.retryAttemptsHistogram = new Histogram({
      name: 'rag_retry_attempts_count',
      help: 'Distribution of retry attempt counts',
      labelNames: ['retry_type'],
      buckets: [1, 2, 3, 4, 5, 10],
      registers: [this.registry],
    });
  }

  /**
   * 初始化并行执行指标
   */
  private initializeParallelMetrics() {
    this.parallelTasksCounter = new Counter({
      name: 'rag_parallel_tasks_total',
      help: 'Total number of parallel tasks executed',
      registers: [this.registry],
    });

    this.parallelTaskSuccessCounter = new Counter({
      name: 'rag_parallel_task_success_total',
      help: 'Total number of successful parallel tasks',
      registers: [this.registry],
    });

    this.parallelTaskFailureCounter = new Counter({
      name: 'rag_parallel_task_failure_total',
      help: 'Total number of failed parallel tasks',
      registers: [this.registry],
    });

    this.parallelConcurrencyGauge = new Gauge({
      name: 'rag_parallel_concurrency',
      help: 'Current number of tasks running in parallel',
      registers: [this.registry],
    });

    this.parallelTaskDuration = new Histogram({
      name: 'rag_parallel_task_duration_ms',
      help: 'Parallel task duration in milliseconds',
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry],
    });
  }

  /**
   * 初始化API调用指标
   */
  private initializeApiMetrics() {
    this.apiCallsCounter = new Counter({
      name: 'rag_api_calls_total',
      help: 'Total number of external API calls',
      labelNames: ['api_type'], // weather, places, web_browse
      registers: [this.registry],
    });

    this.apiCallDuration = new Histogram({
      name: 'rag_api_call_duration_ms',
      help: 'API call duration in milliseconds',
      labelNames: ['api_type'],
      buckets: [100, 250, 500, 1000, 2000, 5000, 10000],
      registers: [this.registry],
    });

    this.apiErrorsCounter = new Counter({
      name: 'rag_api_errors_total',
      help: 'Total number of API errors',
      labelNames: ['api_type', 'error_type'],
      registers: [this.registry],
    });
  }

  /**
   * 初始化RAG查询指标
   */
  private initializeRagMetrics() {
    this.ragQueryCounter = new Counter({
      name: 'rag_query_total',
      help: 'Total number of RAG queries',
      labelNames: ['category'], // WEATHER, POI_HOURS, RULES, etc.
      registers: [this.registry],
    });

    this.ragQueryDuration = new Histogram({
      name: 'rag_query_duration_ms',
      help: 'RAG query duration in milliseconds',
      labelNames: ['category'],
      buckets: [50, 100, 250, 500, 1000, 2000, 5000],
      registers: [this.registry],
    });

    this.ragFallbackLevelCounter = new Counter({
      name: 'rag_fallback_level_total',
      help: 'Count of queries by fallback level',
      labelNames: ['level'], // VECTOR_RAG, HYBRID_RAG, KEYWORD, WEB_BROWSE, GRACEFUL_FAILURE
      registers: [this.registry],
    });
  }

  // ==================== 缓存指标记录方法 ====================

  /**
   * 记录缓存命中
   */
  recordCacheHit(cacheType: CacheType = 'hybrid') {
    this.cacheHitsCounter.inc({ cache_type: cacheType });
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(cacheType: CacheType = 'hybrid') {
    this.cacheMissesCounter.inc({ cache_type: cacheType });
  }

  /**
   * 更新缓存大小
   */
  updateCacheSize(cacheType: CacheType, size: number) {
    this.cacheSizeGauge.set({ cache_type: cacheType }, size);
  }

  /**
   * 记录缓存操作耗时
   */
  recordCacheOperation(
    cacheType: CacheType,
    operation: 'get' | 'set' | 'del',
    durationMs: number,
  ) {
    this.cacheOperationDuration.observe(
      { cache_type: cacheType, operation },
      durationMs,
    );
  }

  // ==================== 重试指标记录方法 ====================

  /**
   * 记录重试操作
   *
   * @param retryType - 重试类型 (api, db, generic)
   * @param attemptCount - 尝试次数
   * @param success - 是否最终成功
   */
  recordRetry(retryType: RetryType, attemptCount: number, success: boolean) {
    this.retryAttemptsCounter.inc({ retry_type: retryType }, attemptCount);
    this.retryAttemptsHistogram.observe({ retry_type: retryType }, attemptCount);

    if (success) {
      this.retrySuccessCounter.inc({ retry_type: retryType });
    } else {
      this.retryFailureCounter.inc({ retry_type: retryType });
    }
  }

  // ==================== 并行执行指标记录方法 ====================

  /**
   * 记录并行任务开始
   */
  recordParallelTaskStart(count: number = 1) {
    this.parallelTasksCounter.inc(count);
    this.parallelConcurrencyGauge.inc(count);
  }

  /**
   * 记录并行任务完成
   */
  recordParallelTaskComplete(success: boolean, durationMs: number) {
    this.parallelConcurrencyGauge.dec();
    this.parallelTaskDuration.observe(durationMs);

    if (success) {
      this.parallelTaskSuccessCounter.inc();
    } else {
      this.parallelTaskFailureCounter.inc();
    }
  }

  // ==================== API调用指标记录方法 ====================

  /**
   * 记录API调用
   *
   * @param apiType - API类型
   * @param durationMs - 耗时（毫秒）
   * @param success - 是否成功
   * @param errorType - 错误类型（如果失败）
   */
  recordApiCall(
    apiType: ApiType,
    durationMs: number,
    success: boolean,
    errorType?: string,
  ) {
    this.apiCallsCounter.inc({ api_type: apiType });
    this.apiCallDuration.observe({ api_type: apiType }, durationMs);

    if (!success && errorType) {
      this.apiErrorsCounter.inc({ api_type: apiType, error_type: errorType });
    }
  }

  // ==================== RAG查询指标记录方法 ====================

  /**
   * 记录RAG查询
   *
   * @param category - 查询类别
   * @param durationMs - 耗时（毫秒）
   * @param fallbackLevel - 降级层级
   */
  recordRagQuery(category: string, durationMs: number, fallbackLevel: string) {
    this.ragQueryCounter.inc({ category });
    this.ragQueryDuration.observe({ category }, durationMs);
    this.ragFallbackLevelCounter.inc({ level: fallbackLevel });
  }

  // ==================== 工具方法 ====================

  /**
   * 获取所有指标（Prometheus格式）
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * 获取指标注册表（用于NestJS Prometheus模块）
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * 重置所有指标（仅用于测试）
   */
  resetMetrics() {
    this.registry.resetMetrics();
  }

  /**
   * 获取缓存统计摘要
   */
  async getCacheStats(): Promise<{
    hits: number;
    misses: number;
    hitRate: number;
  }> {
    const metrics = await this.registry.getMetricsAsJSON();

    let hits = 0;
    let misses = 0;

    for (const metric of metrics) {
      if (metric.name === 'rag_cache_hits_total') {
        hits = metric.values.reduce((sum, v) => sum + (v.value as number), 0);
      }
      if (metric.name === 'rag_cache_misses_total') {
        misses = metric.values.reduce((sum, v) => sum + (v.value as number), 0);
      }
    }

    const total = hits + misses;
    const hitRate = total > 0 ? hits / total : 0;

    return { hits, misses, hitRate };
  }
}
