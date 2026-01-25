// src/rag/rag-metrics.controller.ts
/**
 * RAG Metrics Controller
 *
 * 暴露 Prometheus 指标端点
 *
 * 端点:
 * - GET /rag/metrics - Prometheus 格式的指标
 * - GET /rag/metrics/stats - 人类可读的统计信息
 */

import { Controller, Get, Header } from '@nestjs/common';
import { RagMetricsService } from './services/rag-metrics.service';

@Controller('rag/metrics')
export class RagMetricsController {
  constructor(private readonly metricsService: RagMetricsService) {}

  /**
   * Prometheus 指标端点
   *
   * 示例:
   * curl http://localhost:3000/rag/metrics
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  /**
   * 人类可读的统计信息
   *
   * 示例:
   * curl http://localhost:3000/rag/metrics/stats
   */
  @Get('stats')
  async getStats() {
    const cacheStats = await this.metricsService.getCacheStats();

    return {
      cache: {
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        hitRate: `${(cacheStats.hitRate * 100).toFixed(2)}%`,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
