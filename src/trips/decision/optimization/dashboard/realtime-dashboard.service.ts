/**
 * 实时仪表盘服务
 *
 * P3.3 优化：决策系统状态监控
 *
 * 功能：
 * - 系统健康状态
 * - 决策指标聚合
 * - 实时告警
 * - 趋势分析
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: string;
  components: ComponentHealth[];
  alerts: Alert[];
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  errorRate: number;
  throughput: number;
  lastError?: string;
  lastErrorTime?: string;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  resolvedAt?: string;
}

export interface DecisionMetrics {
  totalDecisions: number;
  successfulDecisions: number;
  failedDecisions: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputPerSecond: number;
  averageUtility: number;
  averageConfidence: number;
  constraintViolationRate: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface DashboardSnapshot {
  timestamp: string;
  health: SystemHealth;
  metrics: DecisionMetrics;
  trends: TrendData;
  activeExperiments: number;
  activeUsers: number;
  recentDecisions: RecentDecision[];
}

export interface TrendData {
  decisionVolume: TimeSeriesPoint[];
  averageLatency: TimeSeriesPoint[];
  errorRate: TimeSeriesPoint[];
  utilityTrend: TimeSeriesPoint[];
}

export interface RecentDecision {
  id: string;
  userId: string;
  utility: number;
  latencyMs: number;
  status: 'success' | 'failure';
  timestamp: string;
}

export interface DashboardConfig {
  refreshIntervalMs: number;
  retentionPeriodMs: number;
  alertThresholds: AlertThresholds;
  maxRecentDecisions: number;
}

export interface AlertThresholds {
  errorRateWarning: number;
  errorRateCritical: number;
  latencyWarning: number;
  latencyCritical: number;
  lowUtilityThreshold: number;
}

const DEFAULT_CONFIG: DashboardConfig = {
  refreshIntervalMs: 5000,
  retentionPeriodMs: 24 * 60 * 60 * 1000,
  alertThresholds: {
    errorRateWarning: 0.05,
    errorRateCritical: 0.1,
    latencyWarning: 1000,
    latencyCritical: 5000,
    lowUtilityThreshold: 0.5,
  },
  maxRecentDecisions: 100,
};

@Injectable()
export class RealtimeDashboardService {
  private readonly logger = new Logger(RealtimeDashboardService.name);
  private config: DashboardConfig = DEFAULT_CONFIG;

  private startTime = Date.now();
  private decisionHistory: RecentDecision[] = [];
  private latencyHistory: number[] = [];
  private alerts: Alert[] = [];
  private timeSeriesData: Map<string, TimeSeriesPoint[]> = new Map();

  private totalDecisions = 0;
  private successfulDecisions = 0;
  private failedDecisions = 0;
  private totalUtility = 0;
  private totalConfidence = 0;
  private constraintViolations = 0;

  configure(config: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 记录决策事件
   */
  recordDecision(
    id: string,
    userId: string,
    utility: number,
    latencyMs: number,
    success: boolean,
    confidence: number = 0.8,
    hasViolations: boolean = false,
  ): void {
    this.totalDecisions++;
    this.latencyHistory.push(latencyMs);

    if (success) {
      this.successfulDecisions++;
      this.totalUtility += utility;
      this.totalConfidence += confidence;
    } else {
      this.failedDecisions++;
    }

    if (hasViolations) {
      this.constraintViolations++;
    }

    const decision: RecentDecision = {
      id,
      userId,
      utility,
      latencyMs,
      status: success ? 'success' : 'failure',
      timestamp: new Date().toISOString(),
    };

    this.decisionHistory.unshift(decision);
    if (this.decisionHistory.length > this.config.maxRecentDecisions) {
      this.decisionHistory.pop();
    }

    this.updateTimeSeries('decisions', 1);
    this.updateTimeSeries('latency', latencyMs);
    this.updateTimeSeries('utility', utility);

    this.checkAlerts(latencyMs, success, utility);

    if (this.latencyHistory.length > 10000) {
      this.latencyHistory = this.latencyHistory.slice(-5000);
    }
  }

  /**
   * 获取仪表盘快照
   */
  getSnapshot(): DashboardSnapshot {
    return {
      timestamp: new Date().toISOString(),
      health: this.getSystemHealth(),
      metrics: this.getMetrics(),
      trends: this.getTrends(),
      activeExperiments: 0,
      activeUsers: this.getActiveUsers(),
      recentDecisions: this.decisionHistory.slice(0, 10),
    };
  }

  /**
   * 获取系统健康状态
   */
  getSystemHealth(): SystemHealth {
    const metrics = this.getMetrics();
    const errorRate = this.totalDecisions > 0
      ? this.failedDecisions / this.totalDecisions
      : 0;

    let status: SystemHealth['status'] = 'healthy';
    if (errorRate > this.config.alertThresholds.errorRateCritical) {
      status = 'unhealthy';
    } else if (errorRate > this.config.alertThresholds.errorRateWarning) {
      status = 'degraded';
    }

    const components: ComponentHealth[] = [
      {
        name: 'Decision Engine',
        status: this.getComponentStatus(errorRate, metrics.p95LatencyMs),
        latencyMs: metrics.averageLatencyMs,
        errorRate,
        throughput: metrics.throughputPerSecond,
      },
      {
        name: 'Constraint Engine',
        status: metrics.constraintViolationRate > 0.2 ? 'degraded' : 'healthy',
        latencyMs: metrics.averageLatencyMs * 0.3,
        errorRate: metrics.constraintViolationRate,
        throughput: metrics.throughputPerSecond,
      },
      {
        name: 'World Model',
        status: 'healthy',
        latencyMs: metrics.averageLatencyMs * 0.5,
        errorRate: 0,
        throughput: metrics.throughputPerSecond,
      },
      {
        name: 'Learning Module',
        status: 'healthy',
        latencyMs: 50,
        errorRate: 0,
        throughput: metrics.throughputPerSecond * 0.1,
      },
    ];

    return {
      status,
      uptime: Date.now() - this.startTime,
      lastCheck: new Date().toISOString(),
      components,
      alerts: this.alerts.filter((a) => !a.resolvedAt).slice(0, 10),
    };
  }

  /**
   * 获取决策指标
   */
  getMetrics(): DecisionMetrics {
    const sortedLatencies = [...this.latencyHistory].sort((a, b) => a - b);
    const n = sortedLatencies.length;

    return {
      totalDecisions: this.totalDecisions,
      successfulDecisions: this.successfulDecisions,
      failedDecisions: this.failedDecisions,
      averageLatencyMs: n > 0 ? sortedLatencies.reduce((a, b) => a + b, 0) / n : 0,
      p50LatencyMs: n > 0 ? sortedLatencies[Math.floor(n * 0.5)] : 0,
      p95LatencyMs: n > 0 ? sortedLatencies[Math.floor(n * 0.95)] : 0,
      p99LatencyMs: n > 0 ? sortedLatencies[Math.floor(n * 0.99)] : 0,
      throughputPerSecond: this.calculateThroughput(),
      averageUtility: this.successfulDecisions > 0
        ? this.totalUtility / this.successfulDecisions
        : 0,
      averageConfidence: this.successfulDecisions > 0
        ? this.totalConfidence / this.successfulDecisions
        : 0,
      constraintViolationRate: this.totalDecisions > 0
        ? this.constraintViolations / this.totalDecisions
        : 0,
    };
  }

  /**
   * 获取趋势数据
   */
  getTrends(): TrendData {
    return {
      decisionVolume: this.getTimeSeries('decisions'),
      averageLatency: this.getTimeSeries('latency'),
      errorRate: this.calculateErrorRateTrend(),
      utilityTrend: this.getTimeSeries('utility'),
    };
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter((a) => !a.resolvedAt);
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * 解决告警
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolvedAt = new Date().toISOString();
    }
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.startTime = Date.now();
    this.decisionHistory = [];
    this.latencyHistory = [];
    this.alerts = [];
    this.timeSeriesData.clear();
    this.totalDecisions = 0;
    this.successfulDecisions = 0;
    this.failedDecisions = 0;
    this.totalUtility = 0;
    this.totalConfidence = 0;
    this.constraintViolations = 0;
  }

  /**
   * 导出仪表盘数据
   */
  exportData(): {
    snapshot: DashboardSnapshot;
    fullHistory: RecentDecision[];
    allAlerts: Alert[];
  } {
    return {
      snapshot: this.getSnapshot(),
      fullHistory: this.decisionHistory,
      allAlerts: this.alerts,
    };
  }

  // ========== 私有方法 ==========

  private getComponentStatus(
    errorRate: number,
    latency: number,
  ): ComponentHealth['status'] {
    const thresholds = this.config.alertThresholds;

    if (errorRate > thresholds.errorRateCritical || latency > thresholds.latencyCritical) {
      return 'unhealthy';
    }
    if (errorRate > thresholds.errorRateWarning || latency > thresholds.latencyWarning) {
      return 'degraded';
    }
    return 'healthy';
  }

  private calculateThroughput(): number {
    const recent = this.decisionHistory.filter((d) => {
      const timestamp = new Date(d.timestamp).getTime();
      return Date.now() - timestamp < 60000;
    });
    return recent.length / 60;
  }

  private getActiveUsers(): number {
    const recentUserIds = new Set(
      this.decisionHistory
        .filter((d) => {
          const timestamp = new Date(d.timestamp).getTime();
          return Date.now() - timestamp < 300000;
        })
        .map((d) => d.userId),
    );
    return recentUserIds.size;
  }

  private updateTimeSeries(name: string, value: number): void {
    let series = this.timeSeriesData.get(name);
    if (!series) {
      series = [];
      this.timeSeriesData.set(name, series);
    }

    const now = new Date();
    const bucket = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
    ).toISOString();

    const existing = series.find((p) => p.timestamp === bucket);
    if (existing) {
      existing.value = (existing.value + value) / 2;
    } else {
      series.push({ timestamp: bucket, value });
    }

    const cutoff = Date.now() - this.config.retentionPeriodMs;
    this.timeSeriesData.set(
      name,
      series.filter((p) => new Date(p.timestamp).getTime() > cutoff),
    );
  }

  private getTimeSeries(name: string): TimeSeriesPoint[] {
    return this.timeSeriesData.get(name) || [];
  }

  private calculateErrorRateTrend(): TimeSeriesPoint[] {
    const decisions = this.getTimeSeries('decisions');

    return decisions.map((point) => {
      const failures = this.decisionHistory.filter((d) => {
        const timestamp = new Date(d.timestamp);
        const bucket = new Date(
          timestamp.getFullYear(),
          timestamp.getMonth(),
          timestamp.getDate(),
          timestamp.getHours(),
          timestamp.getMinutes(),
        ).toISOString();
        return bucket === point.timestamp && d.status === 'failure';
      }).length;

      return {
        timestamp: point.timestamp,
        value: point.value > 0 ? failures / point.value : 0,
      };
    });
  }

  private checkAlerts(latencyMs: number, success: boolean, utility: number): void {
    const thresholds = this.config.alertThresholds;

    if (latencyMs > thresholds.latencyCritical) {
      this.createAlert('critical', 'Decision Engine', `延迟过高: ${latencyMs}ms`);
    } else if (latencyMs > thresholds.latencyWarning) {
      this.createAlert('warning', 'Decision Engine', `延迟偏高: ${latencyMs}ms`);
    }

    if (!success) {
      const errorRate = this.failedDecisions / this.totalDecisions;
      if (errorRate > thresholds.errorRateCritical) {
        this.createAlert('critical', 'Decision Engine', `错误率过高: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    if (utility < thresholds.lowUtilityThreshold && success) {
      this.createAlert('warning', 'Quality', `效用值偏低: ${utility.toFixed(2)}`);
    }
  }

  private createAlert(
    severity: Alert['severity'],
    component: string,
    message: string,
  ): void {
    const recentSimilar = this.alerts.find(
      (a) =>
        a.component === component &&
        a.message === message &&
        !a.resolvedAt &&
        Date.now() - new Date(a.timestamp).getTime() < 60000,
    );

    if (recentSimilar) {
      return;
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      severity,
      component,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    this.alerts.unshift(alert);

    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(0, 500);
    }

    this.logger.warn(`[Dashboard] ${severity.toUpperCase()}: ${component} - ${message}`);
  }
}
