// src/agent/context-engine/services/context-prometheus-metrics.service.ts
/**
 * Context Engine Prometheus 监控指标服务
 * 
 * Phase 1.4 优化: 收集 Context Engine 的关键指标
 * - Context Package 构建性能（延迟、缓存命中率）
 * - 缓存性能（L1/L2 命中率、大小、延迟）
 * - Token 使用（总量、预算使用率）
 * - Block 统计（数量、类型分布）
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';

@Injectable()
export class ContextPrometheusMetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // Context Package 构建指标
  private contextBuildCounter!: Counter;
  private contextBuildDuration!: Histogram;
  private contextBuildCacheHitCounter!: Counter;
  private contextBuildCacheMissCounter!: Counter;

  // 缓存指标
  private contextCacheHitsCounter!: Counter;
  private contextCacheMissesCounter!: Counter;
  private contextCacheSizeGauge!: Gauge;
  private contextCacheOperationDuration!: Histogram;

  // Token 使用指标
  private contextTokenUsageGauge!: Gauge;
  private contextTokenBudgetGauge!: Gauge;
  private contextTokenOverBudgetCounter!: Counter;

  // Block 统计指标
  private contextBlockCountGauge!: Gauge;
  private contextBlockTypeCounter!: Counter;
  private contextBlockPriorityDistribution!: Histogram;

  // Context Learning 指标
  private contextLearningEventCounter!: Counter;
  private contextLearningProcessingDuration!: Histogram;
  private contextLearningConfidenceGauge!: Gauge;
  private contextLearningSampleSizeGauge!: Gauge;
  private contextLearningUpdatedPrioritiesCounter!: Counter;

  constructor() {
    this.registry = new Registry();
  }

  async onModuleInit() {
    this.initializeContextBuildMetrics();
    this.initializeCacheMetrics();
    this.initializeTokenMetrics();
    this.initializeBlockMetrics();
    this.initializeContextLearningMetrics();
  }

  /**
   * 初始化 Context Package 构建指标
   */
  private initializeContextBuildMetrics() {
    this.contextBuildCounter = new Counter({
      name: 'context_package_build_total',
      help: 'Total number of Context Package builds',
      labelNames: ['phase', 'agent'], // planning, execution, review
      registers: [this.registry],
    });

    this.contextBuildDuration = new Histogram({
      name: 'context_package_build_duration_ms',
      help: 'Context Package build duration in milliseconds',
      labelNames: ['phase', 'agent', 'cache_level'], // L1, L2, L3, none
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.registry],
    });

    this.contextBuildCacheHitCounter = new Counter({
      name: 'context_package_build_cache_hits_total',
      help: 'Total number of Context Package cache hits',
      labelNames: ['phase', 'agent', 'cache_level'],
      registers: [this.registry],
    });

    this.contextBuildCacheMissCounter = new Counter({
      name: 'context_package_build_cache_misses_total',
      help: 'Total number of Context Package cache misses',
      labelNames: ['phase', 'agent'],
      registers: [this.registry],
    });
  }

  /**
   * 初始化缓存指标
   */
  private initializeCacheMetrics() {
    this.contextCacheHitsCounter = new Counter({
      name: 'context_cache_hits_total',
      help: 'Total number of Context cache hits',
      labelNames: ['cache_level'], // L1, L2, L3
      registers: [this.registry],
    });

    this.contextCacheMissesCounter = new Counter({
      name: 'context_cache_misses_total',
      help: 'Total number of Context cache misses',
      labelNames: ['cache_level'],
      registers: [this.registry],
    });

    this.contextCacheSizeGauge = new Gauge({
      name: 'context_cache_size',
      help: 'Current number of items in Context cache',
      labelNames: ['cache_level'],
      registers: [this.registry],
    });

    this.contextCacheOperationDuration = new Histogram({
      name: 'context_cache_operation_duration_ms',
      help: 'Context cache operation duration in milliseconds',
      labelNames: ['cache_level', 'operation'], // get, set, del
      buckets: [1, 5, 10, 25, 50, 100, 250, 500],
      registers: [this.registry],
    });
  }

  /**
   * 初始化 Token 使用指标
   */
  private initializeTokenMetrics() {
    this.contextTokenUsageGauge = new Gauge({
      name: 'context_token_usage',
      help: 'Current Token usage in Context Package',
      labelNames: ['phase', 'agent'],
      registers: [this.registry],
    });

    this.contextTokenBudgetGauge = new Gauge({
      name: 'context_token_budget',
      help: 'Token budget for Context Package',
      labelNames: ['phase', 'agent'],
      registers: [this.registry],
    });

    this.contextTokenOverBudgetCounter = new Counter({
      name: 'context_token_over_budget_total',
      help: 'Total number of Context Packages that exceeded token budget',
      labelNames: ['phase', 'agent'],
      registers: [this.registry],
    });
  }

  /**
   * 初始化 Block 统计指标
   */
  private initializeBlockMetrics() {
    this.contextBlockCountGauge = new Gauge({
      name: 'context_block_count',
      help: 'Number of blocks in Context Package',
      labelNames: ['phase', 'agent', 'visibility'], // public, private
      registers: [this.registry],
    });

    this.contextBlockTypeCounter = new Counter({
      name: 'context_block_type_total',
      help: 'Total number of blocks by type',
      labelNames: ['phase', 'agent', 'block_type'], // WORLD_MODEL, COUNTRY_VISA, etc.
      registers: [this.registry],
    });

    this.contextBlockPriorityDistribution = new Histogram({
      name: 'context_block_priority',
      help: 'Distribution of block priorities',
      labelNames: ['phase', 'agent'],
      buckets: [0, 30, 50, 70, 80, 90, 100],
      registers: [this.registry],
    });
  }

  /**
   * 记录 Context Package 构建
   */
  recordBuild(
    phase: string,
    agent: string,
    buildTimeMs: number,
    cacheHit: boolean,
    cacheLevel?: 'L1' | 'L2' | 'L3' | 'none',
  ): void {
    this.contextBuildCounter.inc({ phase, agent });
    this.contextBuildDuration.observe(
      { phase, agent, cache_level: cacheLevel || 'none' },
      buildTimeMs,
    );

    if (cacheHit && cacheLevel) {
      this.contextBuildCacheHitCounter.inc({ phase, agent, cache_level: cacheLevel });
    } else {
      this.contextBuildCacheMissCounter.inc({ phase, agent });
    }
  }

  /**
   * 记录缓存操作
   */
  recordCacheOperation(
    cacheLevel: 'L1' | 'L2' | 'L3',
    operation: 'get' | 'set' | 'del',
    durationMs: number,
    hit?: boolean,
  ): void {
    this.contextCacheOperationDuration.observe(
      { cache_level: cacheLevel, operation },
      durationMs,
    );

    if (hit !== undefined) {
      if (hit) {
        this.contextCacheHitsCounter.inc({ cache_level: cacheLevel });
      } else {
        this.contextCacheMissesCounter.inc({ cache_level: cacheLevel });
      }
    }
  }

  /**
   * 更新缓存大小
   */
  updateCacheSize(cacheLevel: 'L1' | 'L2' | 'L3', size: number): void {
    this.contextCacheSizeGauge.set({ cache_level: cacheLevel }, size);
  }

  /**
   * 记录 Token 使用
   */
  recordTokenUsage(
    phase: string,
    agent: string,
    tokenUsage: number,
    tokenBudget: number,
  ): void {
    this.contextTokenUsageGauge.set({ phase, agent }, tokenUsage);
    this.contextTokenBudgetGauge.set({ phase, agent }, tokenBudget);

    if (tokenUsage > tokenBudget) {
      this.contextTokenOverBudgetCounter.inc({ phase, agent });
    }
  }

  /**
   * 记录 Block 统计
   */
  recordBlockStats(
    phase: string,
    agent: string,
    blocks: Array<{ type: string; priority: number; visibility: string }>,
  ): void {
    // Block 数量（按 visibility）
    const publicBlocks = blocks.filter((b) => b.visibility === 'public').length;
    const privateBlocks = blocks.filter((b) => b.visibility === 'private').length;
    this.contextBlockCountGauge.set({ phase, agent, visibility: 'public' }, publicBlocks);
    this.contextBlockCountGauge.set({ phase, agent, visibility: 'private' }, privateBlocks);

    // Block 类型统计
    const blockTypeCounts = new Map<string, number>();
    for (const block of blocks) {
      blockTypeCounts.set(block.type, (blockTypeCounts.get(block.type) || 0) + 1);
      this.contextBlockTypeCounter.inc({ phase, agent, block_type: block.type });
    }

    // Block 优先级分布
    for (const block of blocks) {
      this.contextBlockPriorityDistribution.observe(
        { phase, agent },
        block.priority,
      );
    }
  }

  /**
   * 获取所有指标（Prometheus格式）
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * 初始化 Context Learning 指标
   */
  private initializeContextLearningMetrics() {
    this.contextLearningEventCounter = new Counter({
      name: 'context_learning_events_total',
      help: 'Total number of Context Learning events',
      labelNames: ['event_type', 'phase', 'agent'], // context_built, context_used, decision_made, user_feedback
      registers: [this.registry],
    });

    this.contextLearningProcessingDuration = new Histogram({
      name: 'context_learning_processing_duration_ms',
      help: 'Context Learning processing duration in milliseconds',
      labelNames: ['event_type', 'phase', 'agent'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
      registers: [this.registry],
    });

    this.contextLearningConfidenceGauge = new Gauge({
      name: 'context_learning_confidence',
      help: 'Context Learning confidence score',
      labelNames: ['phase', 'agent', 'block_key'],
      registers: [this.registry],
    });

    this.contextLearningSampleSizeGauge = new Gauge({
      name: 'context_learning_sample_size',
      help: 'Context Learning sample size',
      labelNames: ['phase', 'agent', 'block_key'],
      registers: [this.registry],
    });

    this.contextLearningUpdatedPrioritiesCounter = new Counter({
      name: 'context_learning_updated_priorities_total',
      help: 'Total number of block priorities updated by Context Learning',
      labelNames: ['phase', 'agent', 'block_type'],
      registers: [this.registry],
    });
  }

  /**
   * 记录 Context Learning 事件
   */
  recordLearningEvent(
    eventType: string,
    phase: string,
    agent: string,
    processingTimeMs: number,
  ): void {
    this.contextLearningEventCounter.inc({ event_type: eventType, phase, agent });
    this.contextLearningProcessingDuration.observe(
      { event_type: eventType, phase, agent },
      processingTimeMs,
    );
  }

  /**
   * 更新 Context Learning 置信度和样本大小
   */
  updateLearningStats(
    phase: string,
    agent: string,
    blockKey: string,
    confidence: number,
    sampleSize: number,
  ): void {
    this.contextLearningConfidenceGauge.set({ phase, agent, block_key: blockKey }, confidence);
    this.contextLearningSampleSizeGauge.set({ phase, agent, block_key: blockKey }, sampleSize);
  }

  /**
   * 记录优先级更新
   */
  recordPriorityUpdate(
    phase: string,
    agent: string,
    blockType: string,
    count: number = 1,
  ): void {
    this.contextLearningUpdatedPrioritiesCounter.inc(
      { phase, agent, block_type: blockType },
      count,
    );
  }

  /**
   * 获取指标注册表（用于NestJS Prometheus模块）
   */
  getRegistry(): Registry {
    return this.registry;
  }
}
