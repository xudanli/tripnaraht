// src/monitoring/prometheus-metrics.controller.ts

import { Controller, Get, Header } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';

/**
 * Prometheus Metrics Controller
 *
 * 提供 /metrics 端点供 Prometheus 抓取
 */
@Controller()
export class PrometheusMetricsController {
  constructor(private readonly metricsService: PrometheusMetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }

  @Get('metrics/json')
  async getMetricsJSON(): Promise<any> {
    return this.metricsService.getMetricsJSON();
  }

  @Get('health/metrics')
  async getHealthMetrics(): Promise<any> {
    const metrics = await this.metricsService.getMetricsJSON();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metricsCount: metrics.length,
      metrics: metrics.map(m => ({
        name: m.name,
        type: m.type,
        help: m.help,
      })),
    };
  }
}
