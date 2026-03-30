// src/itinerary-optimization/services/alternative-comparison.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OptimizationResult } from '../interfaces/plan-request.interface';
import { EvidenceChainItem } from './product-explainable-output-builder.service';

/**
 * 对比维度
 */
export type ComparisonDimension = 'COST' | 'RISK' | 'TIME' | 'COMFORT' | 'SAFETY';

/**
 * 改善项
 */
export interface Improvement {
  dimension: ComparisonDimension;
  improvement: number; // 改善幅度（百分比，正数表示改善）
  evidence: EvidenceChainItem[];
  explanation: string;
  impact_score: number; // 0-1，影响评分
}

/**
 * 权衡项
 */
export interface Tradeoff {
  dimension: ComparisonDimension | string;
  loss: number; // 损失幅度（百分比，正数表示损失）
  explanation: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 替代路线对比
 */
export interface AlternativeComparison {
  original: {
    route: OptimizationResult;
    score: number;
  };
  alternative: {
    route: OptimizationResult;
    score: number;
  };
  improvements: Improvement[];
  tradeoffs: Tradeoff[];
  overall_score_delta: number; // 总体分数差异（正数表示替代方案更好）
  recommendation: 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM';
  explanation: string; // 可读的解释文本
}

/**
 * 替代路线对比服务
 * 
 * 功能：
 * 1. 对比原始路线与替代路线
 * 2. 识别改善和权衡
 * 3. 生成可解释的对比报告
 * 4. 提供推荐决策
 */
@Injectable()
export class AlternativeComparisonService {
  private readonly logger = new Logger(AlternativeComparisonService.name);

  /**
   * 对比路线
   */
  async compareRoutes(
    original: OptimizationResult,
    alternative: OptimizationResult,
    context?: {
      weights?: {
        cost?: number;
        risk?: number;
        time?: number;
        comfort?: number;
        safety?: number;
      };
    }
  ): Promise<AlternativeComparison> {
    // 1. 计算总体分数
    const originalScore = this.calculateOverallScore(original, context);
    const alternativeScore = this.calculateOverallScore(alternative, context);
    const scoreDelta = alternativeScore - originalScore;

    // 2. 识别改善
    const improvements = this.identifyImprovements(original, alternative, context);

    // 3. 识别权衡
    const tradeoffs = this.identifyTradeoffs(original, alternative, context);

    // 4. 生成推荐
    const recommendation = this.generateRecommendation(
      scoreDelta,
      improvements,
      tradeoffs,
      context
    );

    // 5. 生成解释
    const explanation = this.generateExplanation(
      scoreDelta,
      improvements,
      tradeoffs,
      recommendation
    );

    return {
      original: {
        route: original,
        score: originalScore,
      },
      alternative: {
        route: alternative,
        score: alternativeScore,
      },
      improvements,
      tradeoffs,
      overall_score_delta: scoreDelta,
      recommendation,
      explanation,
    };
  }

  /**
   * 批量对比多个替代方案
   */
  async compareMultipleAlternatives(
    original: OptimizationResult,
    alternatives: OptimizationResult[],
    context?: {
      weights?: {
        cost?: number;
        risk?: number;
        time?: number;
        comfort?: number;
        safety?: number;
      };
    }
  ): Promise<AlternativeComparison[]> {
    return Promise.all(
      alternatives.map(alt => this.compareRoutes(original, alt, context))
    );
  }

  /**
   * 计算总体分数
   */
  private calculateOverallScore(
    result: OptimizationResult,
    context?: any
  ): number {
    if (result.status === 'INFEASIBLE') {
      return -1000;
    }

    const weights = context?.weights || {
      cost: 0.2,
      risk: 0.3,
      time: 0.2,
      comfort: 0.15,
      safety: 0.15,
    };

    // 归一化各维度分数到 0-1
    const costScore = this.calculateCostScore(result);
    const riskScore = this.calculateRiskScore(result);
    const timeScore = this.calculateTimeScore(result);
    const comfortScore = this.calculateComfortScore(result);
    const safetyScore = this.calculateSafetyScore(result);

    // 加权平均
    const totalScore =
      weights.cost * costScore +
      weights.risk * riskScore +
      weights.time * timeScore +
      weights.comfort * comfortScore +
      weights.safety * safetyScore;

    return totalScore;
  }

  /**
   * 计算成本分数（0-1，越高越好）
   */
  private calculateCostScore(result: OptimizationResult): number {
    // 简化处理：基于旅行时间和等待时间
    const totalTime = result.summary.total_travel_min + result.summary.total_wait_min;
    const normalizedTime = Math.max(0, 1 - totalTime / 480); // 假设最大 8 小时
    return normalizedTime;
  }

  /**
   * 计算风险分数（0-1，越高越好，即风险越低）
   */
  private calculateRiskScore(result: OptimizationResult): number {
    const riskLevel = result.robustness?.risk_level;
    if (riskLevel === 'low') return 1.0;
    if (riskLevel === 'medium') return 0.6;
    if (riskLevel === 'high') return 0.3;
    return 0.5;

    // 可以考虑加入其他因素（如关键时间窗松弛度）
  }

  /**
   * 计算时间分数（0-1，越高越好）
   */
  private calculateTimeScore(result: OptimizationResult): number {
    // 基于总旅行时间和等待时间
    const travelTime = result.summary.total_travel_min;
    const waitTime = result.summary.total_wait_min;
    const totalTime = travelTime + waitTime;

    // 归一化（假设理想总时间 < 240 分钟 = 4 小时）
    const normalizedTime = Math.max(0, 1 - totalTime / 240);
    return normalizedTime;
  }

  /**
   * 计算舒适度分数（0-1，越高越好）
   */
  private calculateComfortScore(result: OptimizationResult): number {
    // 基于等待时间和丢弃节点数
    const waitTime = result.summary.total_wait_min;
    const droppedCount = result.summary.dropped_count;

    const waitScore = Math.max(0, 1 - waitTime / 120); // 等待时间 < 2 小时为理想
    const droppedScore = Math.max(0, 1 - droppedCount / 5); // 丢弃节点 < 5 个为理想

    return (waitScore * 0.6 + droppedScore * 0.4);
  }

  /**
   * 计算安全分数（0-1，越高越好）
   */
  private calculateSafetyScore(result: OptimizationResult): number {
    // 基于稳健度和关键时间窗
    const robustness = result.robustness?.risk_level;
    let robustnessScore = 0.5;
    if (robustness === 'low') robustnessScore = 1.0;
    else if (robustness === 'medium') robustnessScore = 0.7;
    else if (robustness === 'high') robustnessScore = 0.4;

    // 检查关键时间窗
    const criticalWindows = result.diagnostics?.critical_windows || [];
    const minSlack = criticalWindows.length > 0
      ? Math.min(...criticalWindows.map(w => w.slack_to_close_min))
      : 60;

    const slackScore = Math.min(1, minSlack / 30); // 最小松弛 > 30 分钟为理想

    return (robustnessScore * 0.7 + slackScore * 0.3);
  }

  /**
   * 识别改善
   */
  private identifyImprovements(
    original: OptimizationResult,
    alternative: OptimizationResult,
    _context?: any
  ): Improvement[] {
    const improvements: Improvement[] = [];

    // 成本改善
    const costOriginal = this.calculateCostScore(original);
    const costAlternative = this.calculateCostScore(alternative);
    if (costAlternative > costOriginal) {
      const improvement = ((costAlternative - costOriginal) / costOriginal) * 100;
      improvements.push({
        dimension: 'COST',
        improvement,
        evidence: [],
        explanation: `成本效率提升 ${improvement.toFixed(1)}%（旅行时间和等待时间减少）`,
        impact_score: Math.min(1, improvement / 20), // 20% 改善 = 满分
      });
    }

    // 风险改善
    const riskOriginal = this.calculateRiskScore(original);
    const riskAlternative = this.calculateRiskScore(alternative);
    if (riskAlternative > riskOriginal) {
      const improvement = ((riskAlternative - riskOriginal) / riskOriginal) * 100;
      improvements.push({
        dimension: 'RISK',
        improvement,
        evidence: [],
        explanation: `风险降低 ${improvement.toFixed(1)}%（稳健度提升）`,
        impact_score: Math.min(1, improvement / 30), // 30% 改善 = 满分
      });
    }

    // 时间改善
    const timeOriginal = this.calculateTimeScore(original);
    const timeAlternative = this.calculateTimeScore(alternative);
    if (timeAlternative > timeOriginal) {
      const improvement = ((timeAlternative - timeOriginal) / timeOriginal) * 100;
      improvements.push({
        dimension: 'TIME',
        improvement,
        evidence: [],
        explanation: `时间效率提升 ${improvement.toFixed(1)}%（总时间减少）`,
        impact_score: Math.min(1, improvement / 25), // 25% 改善 = 满分
      });
    }

    // 舒适度改善
    const comfortOriginal = this.calculateComfortScore(original);
    const comfortAlternative = this.calculateComfortScore(alternative);
    if (comfortAlternative > comfortOriginal) {
      const improvement = ((comfortAlternative - comfortOriginal) / comfortOriginal) * 100;
      improvements.push({
        dimension: 'COMFORT',
        improvement,
        evidence: [],
        explanation: `舒适度提升 ${improvement.toFixed(1)}%（等待时间减少，丢弃节点减少）`,
        impact_score: Math.min(1, improvement / 20), // 20% 改善 = 满分
      });
    }

    // 安全改善
    const safetyOriginal = this.calculateSafetyScore(original);
    const safetyAlternative = this.calculateSafetyScore(alternative);
    if (safetyAlternative > safetyOriginal) {
      const improvement = ((safetyAlternative - safetyOriginal) / safetyOriginal) * 100;
      improvements.push({
        dimension: 'SAFETY',
        improvement,
        evidence: [],
        explanation: `安全性提升 ${improvement.toFixed(1)}%（稳健度和时间窗松弛度提升）`,
        impact_score: Math.min(1, improvement / 25), // 25% 改善 = 满分
      });
    }

    return improvements;
  }

  /**
   * 识别权衡
   */
  private identifyTradeoffs(
    original: OptimizationResult,
    alternative: OptimizationResult,
    _context?: any
  ): Tradeoff[] {
    const tradeoffs: Tradeoff[] = [];

    // 检查是否有维度变差
    const dimensions: Array<{ name: ComparisonDimension; score: (r: OptimizationResult) => number }> = [
      { name: 'COST', score: this.calculateCostScore.bind(this) },
      { name: 'RISK', score: this.calculateRiskScore.bind(this) },
      { name: 'TIME', score: this.calculateTimeScore.bind(this) },
      { name: 'COMFORT', score: this.calculateComfortScore.bind(this) },
      { name: 'SAFETY', score: this.calculateSafetyScore.bind(this) },
    ];

    dimensions.forEach(dim => {
      const originalScore = dim.score(original);
      const alternativeScore = dim.score(alternative);

      if (alternativeScore < originalScore) {
        const loss = ((originalScore - alternativeScore) / originalScore) * 100;
        const severity: 'LOW' | 'MEDIUM' | 'HIGH' =
          loss < 10 ? 'LOW' : loss < 30 ? 'MEDIUM' : 'HIGH';

        tradeoffs.push({
          dimension: dim.name,
          loss,
          explanation: `${this.getDimensionName(dim.name)}下降 ${loss.toFixed(1)}%`,
          severity,
        });
      }
    });

    return tradeoffs;
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    scoreDelta: number,
    improvements: Improvement[],
    tradeoffs: Tradeoff[],
    _context?: any
  ): 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM' {
    // 如果总体分数显著提升且无严重权衡，直接接受
    if (scoreDelta > 0.1 && tradeoffs.filter(t => t.severity === 'HIGH').length === 0) {
      return 'ACCEPT';
    }

    // 如果有严重权衡，需要用户确认
    const hasHighSeverityTradeoff = tradeoffs.some(t => t.severity === 'HIGH');
    if (hasHighSeverityTradeoff) {
      return 'NEED_USER_CONFIRM';
    }

    // 如果改善明显但有中等权衡，需要用户确认
    const significantImprovements = improvements.filter(i => i.improvement > 20);
    const mediumTradeoffs = tradeoffs.filter(t => t.severity === 'MEDIUM');
    if (significantImprovements.length > 0 && mediumTradeoffs.length > 0) {
      return 'NEED_USER_CONFIRM';
    }

    // 如果总体分数下降，拒绝
    if (scoreDelta < -0.05) {
      return 'REJECT';
    }

    // 其他情况需要用户确认
    return 'NEED_USER_CONFIRM';
  }

  /**
   * 生成解释
   */
  private generateExplanation(
    scoreDelta: number,
    improvements: Improvement[],
    tradeoffs: Tradeoff[],
    _recommendation: 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM'
  ): string {
    if (improvements.length === 0 && tradeoffs.length === 0) {
      return '替代方案与原始方案相似';
    }

    const parts: string[] = [];

    if (improvements.length > 0) {
      parts.push(`替代方案在以下方面有改善：${improvements.map(i => `${this.getDimensionName(i.dimension)} +${i.improvement.toFixed(1)}%`).join('、')}`);
    }

    if (tradeoffs.length > 0) {
      parts.push(`但在以下方面有所权衡：${tradeoffs.map(t => `${this.getDimensionName(t.dimension as ComparisonDimension)} -${t.loss.toFixed(1)}%`).join('、')}`);
    }

    if (scoreDelta > 0) {
      parts.push(`总体评分提升 ${(scoreDelta * 100).toFixed(1)}%`);
    } else if (scoreDelta < 0) {
      parts.push(`总体评分下降 ${Math.abs(scoreDelta * 100).toFixed(1)}%`);
    }

    return parts.join('。') + '。';
  }

  /**
   * 获取维度名称（中文）
   */
  private getDimensionName(dimension: ComparisonDimension): string {
    const names: Record<ComparisonDimension, string> = {
      COST: '成本效率',
      RISK: '风险控制',
      TIME: '时间效率',
      COMFORT: '舒适度',
      SAFETY: '安全性',
    };
    return names[dimension] || dimension;
  }
}
