// src/trips/decision/optimization/controllers/admin/metrics-admin.controller.ts
/**
 * 管理端 - Decision OS 监控指标 API
 * 
 * 提供 Prometheus 格式指标导出和系统健康状态
 */

import { Controller, Get, Header, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';

import { DecisionMetricsService } from '../../metrics/decision-metrics.service';

// ========== Response Types ==========

export class ComponentHealthResponse {
  @ApiProperty({ description: '组件状态', enum: ['up', 'down', 'degraded'], example: 'up' })
  status!: 'up' | 'down' | 'degraded';

  @ApiProperty({ description: '最后检查时间', example: '2026-03-01T12:00:00Z' })
  lastCheck!: string;

  @ApiPropertyOptional({ description: '状态消息', example: 'Avg latency: 0.5s' })
  message?: string;
}

export class ComponentsHealthResponse {
  @ApiProperty({ description: '决策内核状态', type: ComponentHealthResponse })
  decisionKernel!: ComponentHealthResponse;

  @ApiProperty({ description: '学习循环状态', type: ComponentHealthResponse })
  learningLoop!: ComponentHealthResponse;

  @ApiProperty({ description: '世界模型状态', type: ComponentHealthResponse })
  worldModel!: ComponentHealthResponse;

  @ApiProperty({ description: '约束引擎状态', type: ComponentHealthResponse })
  constraintEngine!: ComponentHealthResponse;
}

export class MetricsOverviewResponse {
  @ApiProperty({ description: '总决策数', example: 1000 })
  totalDecisions!: number;

  @ApiProperty({ description: '平均延迟 (毫秒)', example: 50.5 })
  avgLatencyMs!: number;

  @ApiProperty({ description: '错误率', example: 0.01 })
  errorRate!: number;
}

export class HealthCheckResponse {
  @ApiProperty({ description: '整体状态', enum: ['healthy', 'degraded', 'unhealthy'], example: 'healthy' })
  status!: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({ description: '时间戳', example: '2026-03-01T12:00:00Z' })
  timestamp!: string;

  @ApiProperty({ description: '组件健康状态', type: ComponentsHealthResponse })
  components!: ComponentsHealthResponse;

  @ApiProperty({ description: '指标概览', type: MetricsOverviewResponse })
  metrics!: MetricsOverviewResponse;
}

export class HistogramStats {
  @ApiProperty({ description: '样本数', example: 100 })
  count!: number;

  @ApiProperty({ description: '总和', example: 50.5 })
  sum!: number;

  @ApiProperty({ description: '平均值', example: 0.505 })
  avg!: number;
}

export class MetricsSummaryResponse {
  @ApiProperty({ description: '时间戳', example: '2026-03-01T12:00:00Z' })
  timestamp!: string;

  @ApiProperty({ description: '计数器指标', example: { 'decision_os_constraint_violations_total': 10 } })
  counters!: Record<string, number>;

  @ApiProperty({ description: '仪表盘指标', example: { 'decision_os_cumulative_regret': 0.05 } })
  gauges!: Record<string, number>;

  @ApiProperty({ description: '直方图指标' })
  histograms!: Record<string, HistogramStats>;
}

@ApiTags('Admin - Metrics')
@ApiBearerAuth()
@Controller('api/v2/admin/metrics')
export class MetricsAdminController {
  private readonly logger = new Logger(MetricsAdminController.name);

  constructor(
    private readonly metricsService: DecisionMetricsService,
  ) {}

  @Public()
  @Get('prometheus')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: '导出 Prometheus 格式指标' })
  @ApiResponse({ status: 200, description: 'Prometheus 格式指标文本' })
  async getPrometheusMetrics(): Promise<string> {
    return this.metricsService.exportPrometheusFormat();
  }

  @Public()
  @Get('summary')
  @ApiOperation({ summary: '获取指标摘要' })
  @ApiResponse({ status: 200, description: '指标摘要 JSON' })
  async getMetricsSummary(): Promise<MetricsSummaryResponse> {
    const summary = this.metricsService.getSummary();
    
    return {
      timestamp: new Date().toISOString(),
      counters: this.extractCounters(summary),
      gauges: this.extractGauges(summary),
      histograms: this.extractHistograms(summary),
    };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: '系统健康检查' })
  @ApiResponse({ status: 200, description: '健康状态' })
  async healthCheck(): Promise<HealthCheckResponse> {
    const now = new Date().toISOString();
    const summary = this.metricsService.getSummary() as Record<string, unknown>;
    
    // 从指标推断组件健康状态
    const decisionLatency = this.getHistogramAvg(summary, 'decision_os_decision_latency_seconds');
    const constraintViolations = this.getCounterTotal(summary, 'decision_os_constraint_violations_total');
    
    // 决策内核健康
    const decisionKernelStatus = decisionLatency < 5 ? 'up' : decisionLatency < 10 ? 'degraded' : 'down';
    
    // 学习循环健康
    const learningUpdates = this.getCounterTotal(summary, 'decision_os_learning_updates_total');
    const learningLoopStatus = learningUpdates > 0 ? 'up' : 'degraded';
    
    // 整体状态
    const overallStatus = 
      decisionKernelStatus === 'down' ? 'unhealthy' :
      decisionKernelStatus === 'degraded' || learningLoopStatus === 'degraded' ? 'degraded' : 'healthy';

    return {
      status: overallStatus,
      timestamp: now,
      components: {
        decisionKernel: {
          status: decisionKernelStatus,
          lastCheck: now,
          message: `Avg latency: ${decisionLatency.toFixed(2)}s`,
        },
        learningLoop: {
          status: learningLoopStatus,
          lastCheck: now,
          message: `Total updates: ${learningUpdates}`,
        },
        worldModel: {
          status: 'up',
          lastCheck: now,
        },
        constraintEngine: {
          status: constraintViolations > 100 ? 'degraded' : 'up',
          lastCheck: now,
          message: `Total violations: ${constraintViolations}`,
        },
      },
      metrics: {
        totalDecisions: this.getCounterTotal(summary, 'decision_os_state_transitions_total'),
        avgLatencyMs: decisionLatency * 1000,
        errorRate: constraintViolations > 0 ? constraintViolations / Math.max(1, learningUpdates) : 0,
      },
    };
  }

  @Public()
  @Get('decision-stats')
  @ApiOperation({ summary: '获取决策统计' })
  @ApiResponse({ status: 200, description: '决策相关统计' })
  async getDecisionStats() {
    const summary = this.metricsService.getSummary() as Record<string, unknown>;
    
    return {
      timestamp: new Date().toISOString(),
      decisions: {
        totalTransitions: this.getCounterTotal(summary, 'decision_os_state_transitions_total'),
        cgusIterations: this.getCounterTotal(summary, 'decision_os_cgus_iterations_total'),
        constraintViolations: this.getCounterTotal(summary, 'decision_os_constraint_violations_total'),
      },
      latency: {
        decision: this.getHistogramStats(summary, 'decision_os_decision_latency_seconds'),
        lockWait: this.getHistogramStats(summary, 'decision_os_lock_wait_seconds'),
        lockHold: this.getHistogramStats(summary, 'decision_os_lock_hold_seconds'),
      },
      learning: {
        totalUpdates: this.getCounterTotal(summary, 'decision_os_learning_updates_total'),
      },
      sampling: {
        monteCarloSamples: this.getHistogramStats(summary, 'decision_os_monte_carlo_samples'),
      },
    };
  }

  // ========== Helper Methods ==========

  private extractCounters(summary: Record<string, unknown>): Record<string, number> {
    const counters: Record<string, number> = {};
    for (const [key, value] of Object.entries(summary)) {
      if (key.includes('_total') && typeof value === 'object') {
        counters[key] = this.sumObject(value as Record<string, number>);
      }
    }
    return counters;
  }

  private extractGauges(summary: Record<string, unknown>): Record<string, number> {
    const gauges: Record<string, number> = {};
    const gaugeNames = [
      'decision_os_cumulative_regret',
      'decision_os_convergence_status',
      'decision_os_dso_version',
      'decision_os_effective_sample_size',
      'decision_os_policy_entropy',
      'decision_os_lyapunov_value',
    ];
    
    for (const name of gaugeNames) {
      if (summary[name] && typeof summary[name] === 'object') {
        const values = Object.values(summary[name] as Record<string, number>);
        if (values.length > 0) {
          gauges[name] = values[0];
        }
      }
    }
    return gauges;
  }

  private extractHistograms(summary: Record<string, unknown>): Record<string, { count: number; sum: number; avg: number }> {
    const histograms: Record<string, { count: number; sum: number; avg: number }> = {};
    const histogramNames = [
      'decision_os_decision_latency_seconds',
      'decision_os_utility_score',
      'decision_os_lock_wait_seconds',
      'decision_os_lock_hold_seconds',
      'decision_os_monte_carlo_samples',
    ];
    
    for (const name of histogramNames) {
      if (summary[name] && typeof summary[name] === 'object') {
        const data = summary[name] as Record<string, { count: number; sum: number; avg: number }>;
        const firstValue = Object.values(data)[0];
        if (firstValue) {
          histograms[name] = firstValue;
        }
      }
    }
    return histograms;
  }

  private getCounterTotal(summary: Record<string, unknown>, name: string): number {
    if (!summary[name] || typeof summary[name] !== 'object') return 0;
    return this.sumObject(summary[name] as Record<string, number>);
  }

  private getHistogramAvg(summary: Record<string, unknown>, name: string): number {
    if (!summary[name] || typeof summary[name] !== 'object') return 0;
    const data = summary[name] as Record<string, { count: number; sum: number; avg: number }>;
    const firstValue = Object.values(data)[0];
    return firstValue?.avg ?? 0;
  }

  private getHistogramStats(summary: Record<string, unknown>, name: string): { count: number; sum: number; avg: number } {
    if (!summary[name] || typeof summary[name] !== 'object') {
      return { count: 0, sum: 0, avg: 0 };
    }
    const data = summary[name] as Record<string, { count: number; sum: number; avg: number }>;
    const firstValue = Object.values(data)[0];
    return firstValue ?? { count: 0, sum: 0, avg: 0 };
  }

  private sumObject(obj: Record<string, number>): number {
    return Object.values(obj).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  }
}
