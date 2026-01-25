// src/rag/services/rag-monitoring.service.ts
/**
 * RAG 监控服务
 * 
 * 监控 RAG 模块的关键指标：
 * - 性能指标：检索延迟、Embedding生成延迟、吞吐量
 * - 质量指标：Recall@K、MRR、NDCG（如果有Ground Truth）
 * - 成本指标：Embedding API调用次数、Token消耗
 * - 缓存指标：缓存命中率、缓存大小
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RAGPerformanceMetrics {
  // 检索延迟（毫秒）
  retrievalLatency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  
  // Embedding生成延迟（毫秒）
  embeddingLatency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    count: number;
  };
  
  // 吞吐量（QPS）
  throughput: {
    qps: number;
    totalRequests: number;
    timeWindow: number; // 时间窗口（秒）
  };
  
  // 错误率
  errorRate: {
    totalErrors: number;
    totalRequests: number;
    rate: number;
  };
}

export interface RAGQualityMetrics {
  // Recall@K
  recallAtK: {
    k1: number;
    k5: number;
    k10: number;
    count: number;
  };
  
  // MRR (Mean Reciprocal Rank)
  mrr: {
    value: number;
    count: number;
  };
  
  // NDCG@K
  ndcgAtK: {
    k1: number;
    k5: number;
    k10: number;
    count: number;
  };
}

export interface RAGCostMetrics {
  // Embedding成本
  embeddingCost: {
    totalCalls: number;
    totalTokens: number;
    estimatedCost: number; // USD
    cachedCalls: number; // 缓存命中的调用数
  };
  
  // LLM成本（用于Reranking等）
  llmCost: {
    totalCalls: number;
    totalTokens: number;
    estimatedCost: number; // USD
  };
}

export interface RAGCacheMetrics {
  // Embedding缓存
  embeddingCache: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  };
}

export interface RAGMetrics {
  performance: RAGPerformanceMetrics;
  quality: RAGQualityMetrics;
  cost: RAGCostMetrics;
  cache: RAGCacheMetrics;
  timestamp: Date;
}

export interface RetrievalEvent {
  query: string;
  latency: number; // 毫秒
  embeddingLatency?: number; // 毫秒
  resultCount: number;
  error?: string;
  useHybridSearch?: boolean;
  useReranking?: boolean;
  cacheHit?: boolean;
}

export interface QualityEvent {
  query: string;
  retrievedIds: string[];
  groundTruthIds: string[];
  k?: number; // 用于计算Recall@K
}

@Injectable()
export class RAGMonitoringService {
  private readonly logger = new Logger(RAGMonitoringService.name);
  
  // 性能指标存储（滑动窗口）
  private readonly retrievalLatencies: number[] = [];
  private readonly embeddingLatencies: number[] = [];
  private readonly errors: Array<{ timestamp: number; error: string }> = [];
  
  // 质量指标存储
  private readonly qualityEvents: QualityEvent[] = [];
  
  // 成本指标
  private embeddingCalls = 0;
  private embeddingTokens = 0;
  private embeddingCachedCalls = 0;
  private llmCalls = 0;
  private llmTokens = 0;
  
  // 缓存指标
  private cacheHits = 0;
  private cacheMisses = 0;
  
  // 配置
  private readonly MAX_SAMPLES = 1000; // 最大样本数
  private readonly WINDOW_SIZE_MS = 60000; // 1分钟滑动窗口

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 记录检索事件
   */
  recordRetrieval(event: RetrievalEvent): void {
    // 记录检索延迟
    this.retrievalLatencies.push(event.latency);
    if (this.retrievalLatencies.length > this.MAX_SAMPLES) {
      this.retrievalLatencies.shift();
    }

    // 记录Embedding延迟
    if (event.embeddingLatency !== undefined) {
      this.embeddingLatencies.push(event.embeddingLatency);
      if (this.embeddingLatencies.length > this.MAX_SAMPLES) {
        this.embeddingLatencies.shift();
      }
    }

    // 记录错误
    if (event.error) {
      this.errors.push({
        timestamp: Date.now(),
        error: event.error,
      });
      // 清理过期错误（保留最近1小时）
      const oneHourAgo = Date.now() - 3600000;
      while (this.errors.length > 0 && this.errors[0].timestamp < oneHourAgo) {
        this.errors.shift();
      }
    }

    // 记录缓存命中
    if (event.cacheHit === true) {
      this.cacheHits++;
    } else if (event.cacheHit === false) {
      this.cacheMisses++;
    }

    // 可选：保存到数据库（QueryHistory表）
    this.saveToQueryHistory(event).catch(err => {
      this.logger.warn(`保存查询历史失败: ${err.message}`);
    });
  }

  /**
   * 记录质量事件
   */
  recordQuality(event: QualityEvent): void {
    this.qualityEvents.push(event);
    
    // 限制存储数量
    if (this.qualityEvents.length > this.MAX_SAMPLES) {
      this.qualityEvents.shift();
    }
  }

  /**
   * 记录Embedding调用
   */
  recordEmbeddingCall(tokens: number, cached: boolean = false): void {
    this.embeddingCalls++;
    this.embeddingTokens += tokens;
    if (cached) {
      this.embeddingCachedCalls++;
    }
  }

  /**
   * 记录LLM调用（用于Reranking等）
   */
  recordLLMCall(tokens: number): void {
    this.llmCalls++;
    this.llmTokens += tokens;
  }

  /**
   * 记录缓存统计
   */
  recordCacheStats(hits: number, misses: number): void {
    this.cacheHits = hits;
    this.cacheMisses = misses;
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics(): RAGPerformanceMetrics {
    const retrievalLatency = this.calculatePercentiles(this.retrievalLatencies);
    const embeddingLatency = this.calculatePercentiles(this.embeddingLatencies);
    
    // 计算吞吐量（最近1分钟）
    const oneMinuteAgo = Date.now() - this.WINDOW_SIZE_MS;
    const recentRequests = this.retrievalLatencies.filter((_, index) => {
      // 简化：假设最近的请求在窗口内
      return index >= this.retrievalLatencies.length - Math.min(100, this.retrievalLatencies.length);
    });
    const qps = recentRequests.length / (this.WINDOW_SIZE_MS / 1000);

    // 计算错误率
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
        rate: Math.round(errorRate * 10000) / 100, // 百分比
      },
    };
  }

  /**
   * 获取质量指标
   */
  getQualityMetrics(): RAGQualityMetrics {
    if (this.qualityEvents.length === 0) {
      return {
        recallAtK: { k1: 0, k5: 0, k10: 0, count: 0 },
        mrr: { value: 0, count: 0 },
        ndcgAtK: { k1: 0, k5: 0, k10: 0, count: 0 },
      };
    }

    // 计算Recall@K
    const recallAt1 = this.calculateRecallAtK(this.qualityEvents, 1);
    const recallAt5 = this.calculateRecallAtK(this.qualityEvents, 5);
    const recallAt10 = this.calculateRecallAtK(this.qualityEvents, 10);

    // 计算MRR
    const mrr = this.calculateMRR(this.qualityEvents);

    // 计算NDCG@K
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

  /**
   * 获取成本指标
   */
  getCostMetrics(): RAGCostMetrics {
    // Embedding成本：text-embedding-3-small = $0.02 / 1M tokens
    const embeddingCostPerToken = 0.02 / 1000000;
    const embeddingCost = this.embeddingTokens * embeddingCostPerToken;

    // LLM成本：假设使用gpt-4o-mini = $0.15 / 1M input tokens, $0.60 / 1M output tokens
    // 简化：假设平均50% input, 50% output
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

  /**
   * 获取缓存指标
   */
  getCacheMetrics(): RAGCacheMetrics {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? this.cacheHits / total : 0;

    return {
      embeddingCache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        hitRate: Math.round(hitRate * 10000) / 100,
        size: 0, // 需要从EmbeddingCacheService获取
      },
    };
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): RAGMetrics {
    return {
      performance: this.getPerformanceMetrics(),
      quality: this.getQualityMetrics(),
      cost: this.getCostMetrics(),
      cache: this.getCacheMetrics(),
      timestamp: new Date(),
    };
  }

  /**
   * 重置所有指标
   */
  resetMetrics(): void {
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

  /**
   * 计算百分位数
   */
  private calculatePercentiles(values: number[]): {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  } {
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

  /**
   * 计算Recall@K
   */
  private calculateRecallAtK(events: QualityEvent[], k: number): number {
    if (events.length === 0) return 0;

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

  /**
   * 计算MRR
   */
  private calculateMRR(events: QualityEvent[]): number {
    if (events.length === 0) return 0;

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

  /**
   * 计算NDCG@K
   */
  private calculateNDCGAtK(events: QualityEvent[], k: number): number {
    if (events.length === 0) return 0;

    const ndcgs = events.map(event => {
      const retrieved = event.retrievedIds.slice(0, k);
      const groundTruth = new Set(event.groundTruthIds);
      
      // 计算DCG
      let dcg = 0;
      for (let i = 0; i < retrieved.length; i++) {
        const relevance = groundTruth.has(retrieved[i]) ? 1 : 0;
        dcg += relevance / Math.log2(i + 2);
      }
      
      // 计算IDCG（理想情况：所有相关文档都在前面）
      const idealRelevance = Math.min(k, groundTruth.size);
      let idcg = 0;
      for (let i = 0; i < idealRelevance; i++) {
        idcg += 1 / Math.log2(i + 2);
      }
      
      return idcg > 0 ? dcg / idcg : 0;
    });

    return ndcgs.reduce((sum, ndcg) => sum + ndcg, 0) / ndcgs.length;
  }

  /**
   * 保存到QueryHistory表
   */
  private async saveToQueryHistory(event: RetrievalEvent): Promise<void> {
    try {
      await this.prisma.queryHistory.create({
        data: {
          query: event.query,
          retrievedChunks: [],
          executionTimeMs: event.latency,
          avgCredibility: 0, // 可以从结果中计算
        },
      });
    } catch (error: any) {
      // 忽略错误，不影响主流程
      this.logger.debug(`保存查询历史失败: ${error.message}`);
    }
  }
}
