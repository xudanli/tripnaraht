// src/kpu/services/kpu-monitoring.service.ts
/**
 * KPU监控服务
 * 
 * 用于监控KPU的性能指标和运行状态
 */

import { Injectable, Logger } from '@nestjs/common';

export interface KPUMetrics {
  // 验证指标
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  avgValidationLatency: number;
  avgValidationScore: number;

  // 检索指标
  totalRetrievals: number;
  avgRetrievalLatency: number;
  avgCandidatesPerRetrieval: number;

  // 生成指标
  totalGenerations: number;
  successfulGenerations: number;
  failedGenerations: number;
  avgGenerationLatency: number;
  retryCount: number;

  // 缓存指标
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;

  // LLM调用指标
  totalLlmCalls: number;
  successfulLlmCalls: number;
  failedLlmCalls: number;
  avgLlmLatency: number;
}

@Injectable()
export class KPUMonitoringService {
  private readonly logger = new Logger(KPUMonitoringService.name);
  private metrics: KPUMetrics = {
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

  private validationLatencies: number[] = [];
  private retrievalLatencies: number[] = [];
  private generationLatencies: number[] = [];
  private validationScores: number[] = [];
  private llmLatencies: number[] = [];

  /**
   * 记录验证指标
   */
  recordValidation(success: boolean, latency: number, score?: number) {
    this.metrics.totalValidations++;
    if (success) {
      this.metrics.successfulValidations++;
    } else {
      this.metrics.failedValidations++;
    }

    this.validationLatencies.push(latency);
    if (score !== undefined) {
      this.validationScores.push(score);
    }

    this.updateAvgValidationLatency();
    this.updateAvgValidationScore();
  }

  /**
   * 记录检索指标
   */
  recordRetrieval(latency: number, candidateCount: number) {
    this.metrics.totalRetrievals++;
    this.retrievalLatencies.push(latency);
    this.metrics.avgCandidatesPerRetrieval = 
      (this.metrics.avgCandidatesPerRetrieval * (this.metrics.totalRetrievals - 1) + candidateCount) / 
      this.metrics.totalRetrievals;

    this.updateAvgRetrievalLatency();
  }

  /**
   * 记录生成指标
   */
  recordGeneration(success: boolean, latency: number, retried: boolean = false) {
    this.metrics.totalGenerations++;
    if (success) {
      this.metrics.successfulGenerations++;
    } else {
      this.metrics.failedGenerations++;
    }

    if (retried) {
      this.metrics.retryCount++;
    }

    this.generationLatencies.push(latency);
    this.updateAvgGenerationLatency();
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
    this.updateCacheHitRate();
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
    this.updateCacheHitRate();
  }

  /**
   * 记录LLM调用
   */
  recordLlmCall(success: boolean, latency: number) {
    this.metrics.totalLlmCalls++;
    if (success) {
      this.metrics.successfulLlmCalls++;
    } else {
      this.metrics.failedLlmCalls++;
    }

    this.llmLatencies.push(latency);
    this.updateAvgLlmLatency();
  }

  /**
   * 获取当前指标
   */
  getMetrics(): KPUMetrics {
    return { ...this.metrics };
  }

  /**
   * 重置指标
   */
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

  /**
   * 获取指标摘要
   */
  getMetricsSummary(): string {
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

  // 私有方法：更新平均延迟
  private updateAvgValidationLatency() {
    if (this.validationLatencies.length > 0) {
      const sum = this.validationLatencies.reduce((a, b) => a + b, 0);
      this.metrics.avgValidationLatency = sum / this.validationLatencies.length;
    }
  }

  private updateAvgRetrievalLatency() {
    if (this.retrievalLatencies.length > 0) {
      const sum = this.retrievalLatencies.reduce((a, b) => a + b, 0);
      this.metrics.avgRetrievalLatency = sum / this.retrievalLatencies.length;
    }
  }

  private updateAvgGenerationLatency() {
    if (this.generationLatencies.length > 0) {
      const sum = this.generationLatencies.reduce((a, b) => a + b, 0);
      this.metrics.avgGenerationLatency = sum / this.generationLatencies.length;
    }
  }

  private updateAvgValidationScore() {
    if (this.validationScores.length > 0) {
      const sum = this.validationScores.reduce((a, b) => a + b, 0);
      this.metrics.avgValidationScore = sum / this.validationScores.length;
    }
  }

  private updateCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (total > 0) {
      this.metrics.cacheHitRate = (this.metrics.cacheHits / total) * 100;
    }
  }

  private updateAvgLlmLatency() {
    if (this.llmLatencies.length > 0) {
      const sum = this.llmLatencies.reduce((a, b) => a + b, 0);
      this.metrics.avgLlmLatency = sum / this.llmLatencies.length;
    }
  }
}
