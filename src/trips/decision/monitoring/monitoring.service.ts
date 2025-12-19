// src/trips/decision/monitoring/monitoring.service.ts

/**
 * 监控和告警服务
 * 
 * 实时指标监控
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionRunLog } from '../decision-log';
import { PlanMetrics } from '../evaluation/evaluation.service';

export interface MonitoringMetrics {
  // 性能指标
  performance: {
    avgGenerationTime: number; // 平均生成时间（ms）
    avgRepairTime: number; // 平均修复时间（ms）
    p95GenerationTime: number; // P95 生成时间
    p95RepairTime: number; // P95 修复时间
  };

  // 质量指标
  quality: {
    avgExecutabilityRate: number; // 平均可执行率
    avgStabilityScore: number; // 平均稳定性
    violationRate: number; // 违规率
  };

  // 使用指标
  usage: {
    totalPlansGenerated: number;
    totalRepairs: number;
    activeUsers: number; // 活跃用户数（如果有）
  };
}

export interface Alert {
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: string;
  details?: Record<string, any>;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly metrics: MonitoringMetrics = {
    performance: {
      avgGenerationTime: 0,
      avgRepairTime: 0,
      p95GenerationTime: 0,
      p95RepairTime: 0,
    },
    quality: {
      avgExecutabilityRate: 0,
      avgStabilityScore: 0,
      violationRate: 0,
    },
    usage: {
      totalPlansGenerated: 0,
      totalRepairs: 0,
      activeUsers: 0,
    },
  };

  private readonly generationTimes: number[] = [];
  private readonly repairTimes: number[] = [];
  private readonly executabilityRates: number[] = [];
  private readonly stabilityScores: number[] = [];
  private readonly alerts: Alert[] = [];

  /**
   * 记录计划生成
   */
  recordPlanGeneration(
    log: DecisionRunLog,
    generationTime: number,
    metrics?: PlanMetrics
  ): void {
    this.metrics.usage.totalPlansGenerated++;

    // 记录性能
    this.generationTimes.push(generationTime);
    this.updatePerformanceMetrics();

    // 记录质量
    if (metrics) {
      this.executabilityRates.push(
        metrics.executability.executabilityRate
      );
      this.stabilityScores.push(metrics.stability.stabilityScore);
      this.updateQualityMetrics();
    }

    // 检查告警
    this.checkAlerts();
  }

  /**
   * 记录计划修复
   */
  recordPlanRepair(
    log: DecisionRunLog,
    repairTime: number,
    metrics?: PlanMetrics
  ): void {
    this.metrics.usage.totalRepairs++;

    // 记录性能
    this.repairTimes.push(repairTime);
    this.updatePerformanceMetrics();

    // 记录质量
    if (metrics) {
      this.executabilityRates.push(
        metrics.executability.executabilityRate
      );
      this.stabilityScores.push(metrics.stability.stabilityScore);
      this.updateQualityMetrics();
    }

    // 检查告警
    this.checkAlerts();
  }

  /**
   * 获取当前指标
   */
  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * 获取告警
   */
  getAlerts(level?: Alert['level']): Alert[] {
    if (level) {
      return this.alerts.filter(a => a.level === level);
    }
    return [...this.alerts];
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(): void {
    if (this.generationTimes.length > 0) {
      const sum = this.generationTimes.reduce((a, b) => a + b, 0);
      this.metrics.performance.avgGenerationTime =
        sum / this.generationTimes.length;

      const sorted = [...this.generationTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.metrics.performance.p95GenerationTime = sorted[p95Index] || 0;
    }

    if (this.repairTimes.length > 0) {
      const sum = this.repairTimes.reduce((a, b) => a + b, 0);
      this.metrics.performance.avgRepairTime =
        sum / this.repairTimes.length;

      const sorted = [...this.repairTimes].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      this.metrics.performance.p95RepairTime = sorted[p95Index] || 0;
    }
  }

  /**
   * 更新质量指标
   */
  private updateQualityMetrics(): void {
    if (this.executabilityRates.length > 0) {
      const sum = this.executabilityRates.reduce((a, b) => a + b, 0);
      this.metrics.quality.avgExecutabilityRate =
        sum / this.executabilityRates.length;
    }

    if (this.stabilityScores.length > 0) {
      const sum = this.stabilityScores.reduce((a, b) => a + b, 0);
      this.metrics.quality.avgStabilityScore =
        sum / this.stabilityScores.length;
    }

    // 计算违规率（简化：基于可执行率）
    this.metrics.quality.violationRate =
      1 - this.metrics.quality.avgExecutabilityRate;
  }

  /**
   * 检查告警
   */
  private checkAlerts(): void {
    // 性能告警
    if (
      this.metrics.performance.avgGenerationTime > 5000 &&
      this.generationTimes.length > 10
    ) {
      this.addAlert('warning', '平均生成时间超过5秒', {
        avgTime: this.metrics.performance.avgGenerationTime,
      });
    }

    if (
      this.metrics.performance.p95GenerationTime > 10000 &&
      this.generationTimes.length > 10
    ) {
      this.addAlert('error', 'P95生成时间超过10秒', {
        p95Time: this.metrics.performance.p95GenerationTime,
      });
    }

    // 质量告警
    if (
      this.metrics.quality.avgExecutabilityRate < 0.8 &&
      this.executabilityRates.length > 10
    ) {
      this.addAlert('warning', '平均可执行率低于80%', {
        rate: this.metrics.quality.avgExecutabilityRate,
      });
    }

    if (
      this.metrics.quality.violationRate > 0.3 &&
      this.executabilityRates.length > 10
    ) {
      this.addAlert('error', '违规率超过30%', {
        violationRate: this.metrics.quality.violationRate,
      });
    }
  }

  /**
   * 添加告警
   */
  private addAlert(
    level: Alert['level'],
    message: string,
    details?: Record<string, any>
  ): void {
    const alert: Alert = {
      level,
      message,
      timestamp: new Date().toISOString(),
      details,
    };

    this.alerts.push(alert);

    // 只保留最近100条告警
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // 根据级别记录日志
    switch (level) {
      case 'critical':
      case 'error':
        this.logger.error(`[Alert] ${message}`, details);
        break;
      case 'warning':
        this.logger.warn(`[Alert] ${message}`, details);
        break;
      default:
        this.logger.log(`[Alert] ${message}`, details);
    }
  }

  /**
   * 重置指标（用于测试）
   */
  reset(): void {
    this.generationTimes.length = 0;
    this.repairTimes.length = 0;
    this.executabilityRates.length = 0;
    this.stabilityScores.length = 0;
    this.alerts.length = 0;
    Object.assign(this.metrics, {
      performance: {
        avgGenerationTime: 0,
        avgRepairTime: 0,
        p95GenerationTime: 0,
        p95RepairTime: 0,
      },
      quality: {
        avgExecutabilityRate: 0,
        avgStabilityScore: 0,
        violationRate: 0,
      },
      usage: {
        totalPlansGenerated: 0,
        totalRepairs: 0,
        activeUsers: 0,
      },
    });
  }
}

