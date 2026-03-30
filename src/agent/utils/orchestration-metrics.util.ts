// src/agent/utils/orchestration-metrics.util.ts

import { Injectable } from '@nestjs/common';
import { OrchestrationMode } from './resolve-orchestration-mode.util';
import { RiskLevel } from './orchestration-signals.util';

/**
 * 编排 Metrics 打点工具
 * 
 * 用于监控和观察：
 * - 三种 mode 占比
 * - risk 分布
 * - consent 触发率
 * - 推荐 SM vs 实际执行 SM 的占比
 */

/**
 * Metrics 记录接口
 */
export interface OrchestrationMetrics {
  /**
   * 记录编排模式选择
   */
  recordMode(mode: OrchestrationMode, requestId: string): void;
  
  /**
   * 记录风险级别
   */
  recordRisk(risk: RiskLevel, requestId: string): void;
  
  /**
   * 记录 consent 触发
   */
  recordConsent(triggered: boolean, requestId: string, reason?: string): void;
  
  /**
   * 记录推荐 vs 实际执行
   */
  recordRecommendationVsExecution(
    recommendedSM: boolean,
    actualMode: OrchestrationMode,
    requestId: string,
  ): void;
  
  /**
   * 获取 metrics 摘要
   */
  getMetricsSummary(): {
    modeDistribution: Record<OrchestrationMode, number>;
    riskDistribution: Record<RiskLevel, number>;
    consentTriggerRate: number;
    smRecommendationAccuracy: {
      recommended: number;
      executed: number;
      accuracy: number;
    };
  };
}

/**
 * 内存实现的 Metrics（可用于开发/测试）
 * 生产环境应接入 Prometheus/DataDog 等
 */
@Injectable()
export class InMemoryOrchestrationMetrics implements OrchestrationMetrics {
  private readonly modeCounts: Map<OrchestrationMode, number> = new Map();
  private readonly riskCounts: Map<RiskLevel, number> = new Map();
  private readonly consentTriggers: boolean[] = [];
  private readonly recommendationVsExecution: Array<{
    recommendedSM: boolean;
    actualMode: OrchestrationMode;
  }> = [];

  recordMode(mode: OrchestrationMode, _requestId: string): void {
    this.modeCounts.set(mode, (this.modeCounts.get(mode) || 0) + 1);
  }

  recordRisk(risk: RiskLevel, _requestId: string): void {
    this.riskCounts.set(risk, (this.riskCounts.get(risk) || 0) + 1);
  }

  recordConsent(triggered: boolean, _requestId: string, _reason?: string): void {
    this.consentTriggers.push(triggered);
  }

  recordRecommendationVsExecution(
    recommendedSM: boolean,
    actualMode: OrchestrationMode,
    _requestId: string,
  ): void {
    this.recommendationVsExecution.push({ recommendedSM, actualMode });
  }

  getMetricsSummary() {
    const modeDistribution: Record<OrchestrationMode, number> = {
      LEGACY: this.modeCounts.get('LEGACY') || 0,
      CLAUDE_DYNAMIC: this.modeCounts.get('CLAUDE_DYNAMIC') || 0,
      CLAUDE_SM: this.modeCounts.get('CLAUDE_SM') || 0,
    };

    const riskDistribution: Record<RiskLevel, number> = {
      LOW: this.riskCounts.get('LOW') || 0,
      MEDIUM: this.riskCounts.get('MEDIUM') || 0,
      HIGH: this.riskCounts.get('HIGH') || 0,
      CRITICAL: this.riskCounts.get('CRITICAL') || 0,
    };

    const consentTriggerRate =
      this.consentTriggers.length > 0
        ? this.consentTriggers.filter(Boolean).length / this.consentTriggers.length
        : 0;

    const recommended = this.recommendationVsExecution.filter(r => r.recommendedSM).length;
    const executed = this.recommendationVsExecution.filter(
      r => r.recommendedSM && r.actualMode === 'CLAUDE_SM',
    ).length;
    const accuracy = recommended > 0 ? executed / recommended : 0;

    return {
      modeDistribution,
      riskDistribution,
      consentTriggerRate,
      smRecommendationAccuracy: {
        recommended,
        executed,
        accuracy,
      },
    };
  }
}
