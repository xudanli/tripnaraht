// src/monitoring/monitoring.module.ts

import { Module, Global } from '@nestjs/common';
import { PrometheusMetricsService } from './prometheus-metrics.service';
import { PrometheusMetricsController } from './prometheus-metrics.controller';

/**
 * Monitoring Module
 *
 * 提供全局可用的监控服务
 */
@Global()
@Module({
  providers: [PrometheusMetricsService],
  controllers: [PrometheusMetricsController],
  exports: [PrometheusMetricsService],
})
export class MonitoringModule {}
