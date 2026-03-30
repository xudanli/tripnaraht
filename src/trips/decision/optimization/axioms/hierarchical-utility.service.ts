// src/trips/decision/optimization/axioms/hierarchical-utility.service.ts
/**
 * 分层效用服务
 * 
 * 实现公理二：分层组合公理
 * 
 * 结构：
 * - 顶层维度 (β 权重): SAFETY, EXPERIENCE, EFFICIENCY, PHILOSOPHY
 * - 次级维度 (α 权重): 各顶层下的子指标
 * 
 * 总效用 = Σ βₖ × (Σ αₖⱼ × subScoreⱼ)
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RobustnessConstraints,
  DEFAULT_ROBUSTNESS_CONSTRAINTS,
  evaluateRobustness,
  RobustnessEvaluation,
} from './axiom-system';

/**
 * 顶层维度权重配置
 */
export interface TopLevelWeights {
  /** β₁: 安全维度权重 */
  safety: number;
  /** β₂: 体验维度权重 */
  experience: number;
  /** β₃: 效率维度权重 */
  efficiency: number;
  /** β₄: 哲学维度权重 */
  philosophy: number;
}

/**
 * 默认顶层权重
 */
export const DEFAULT_TOP_LEVEL_WEIGHTS: TopLevelWeights = {
  safety: 0.30,
  experience: 0.25,
  efficiency: 0.25,
  philosophy: 0.20,
};

/**
 * 子维度权重配置
 */
export interface SubDimensionWeights {
  safety: {
    physicalSafety: number;
    weatherSafety: number;
    terrainSafety: number;
    complianceSafety: number;
  };
  experience: {
    poiCoverage: number;
    experienceQuality: number;
    scenicValue: number;
  };
  efficiency: {
    timeEfficiency: number;
    budgetEfficiency: number;
    fatigueManagement: number;
    pacingBalance: number;
  };
  philosophy: {
    routePhilosophyAlignment: number;
    structuralIntegrity: number;
  };
}

/**
 * 默认子维度权重
 */
export const DEFAULT_SUB_DIMENSION_WEIGHTS: SubDimensionWeights = {
  safety: {
    physicalSafety: 0.35,
    weatherSafety: 0.25,
    terrainSafety: 0.25,
    complianceSafety: 0.15,
  },
  experience: {
    poiCoverage: 0.40,
    experienceQuality: 0.35,
    scenicValue: 0.25,
  },
  efficiency: {
    timeEfficiency: 0.30,
    budgetEfficiency: 0.25,
    fatigueManagement: 0.30,
    pacingBalance: 0.15,
  },
  philosophy: {
    routePhilosophyAlignment: 0.60,
    structuralIntegrity: 0.40,
  },
};

/**
 * 子维度分数输入
 */
export interface SubDimensionScoresInput {
  safety: {
    physicalSafety: number;
    weatherSafety: number;
    terrainSafety: number;
    complianceSafety: number;
  };
  experience: {
    poiCoverage: number;
    experienceQuality: number;
    scenicValue: number;
  };
  efficiency: {
    timeEfficiency: number;
    budgetEfficiency: number;
    fatigueManagement: number;
    pacingBalance: number;
  };
  philosophy: {
    routePhilosophyAlignment: number;
    structuralIntegrity: number;
  };
}

/**
 * 分层效用评估结果
 */
export interface HierarchicalEvaluationResult {
  /** 总效用 (0-1) */
  totalUtility: number;
  
  /** 顶层维度分数 */
  dimensionScores: {
    safety: number;
    experience: number;
    efficiency: number;
    philosophy: number;
  };
  
  /** 加权贡献分析 */
  weightedContributions: {
    safety: number;
    experience: number;
    efficiency: number;
    philosophy: number;
  };
  
  /** 使用的权重配置 */
  weights: {
    topLevel: TopLevelWeights;
    subDimension: SubDimensionWeights;
  };
  
  /** 稳健性评估（如果提供了样本） */
  robustness?: RobustnessEvaluation;
  
  /** 评估时间 */
  evaluatedAt: string;
}

@Injectable()
export class HierarchicalUtilityService {
  private readonly logger = new Logger(HierarchicalUtilityService.name);
  
  private topLevelWeights: TopLevelWeights = { ...DEFAULT_TOP_LEVEL_WEIGHTS };
  private subDimensionWeights: SubDimensionWeights = JSON.parse(JSON.stringify(DEFAULT_SUB_DIMENSION_WEIGHTS));

  /**
   * 获取当前顶层权重
   */
  getTopLevelWeights(): TopLevelWeights {
    return { ...this.topLevelWeights };
  }

  /**
   * 获取当前子维度权重
   */
  getSubDimensionWeights(): SubDimensionWeights {
    return JSON.parse(JSON.stringify(this.subDimensionWeights));
  }

  /**
   * 获取当前完整效用结构
   */
  getCurrentStructure(): { topLevel: TopLevelWeights; subDimension: SubDimensionWeights } {
    return {
      topLevel: this.getTopLevelWeights(),
      subDimension: this.getSubDimensionWeights(),
    };
  }

  /**
   * 批量更新子维度权重
   */
  updateAllSubDimensionWeights(
    newWeights: Partial<Record<keyof SubDimensionWeights, Record<string, number>>>,
  ): void {
    for (const [dimension, weights] of Object.entries(newWeights)) {
      if (weights && dimension in this.subDimensionWeights) {
        this.updateSubDimensionWeights(
          dimension as keyof SubDimensionWeights,
          weights as any,
        );
      }
    }
  }

  /**
   * 更新顶层权重（公理六：参数可学习）
   */
  updateTopLevelWeights(newWeights: Partial<TopLevelWeights>): void {
    const updated = { ...this.topLevelWeights, ...newWeights };
    
    // 验证归一化
    const sum = updated.safety + updated.experience + updated.efficiency + updated.philosophy;
    if (Math.abs(sum - 1) > 0.001) {
      throw new Error(`顶层权重和 ${sum} 必须等于 1`);
    }
    
    this.topLevelWeights = updated;
    this.logger.log(`[HierarchicalUtility] 更新顶层权重: ${JSON.stringify(updated)}`);
  }

  /**
   * 更新子维度权重（公理六：参数可学习）
   */
  updateSubDimensionWeights<K extends keyof SubDimensionWeights>(
    dimension: K,
    newWeights: Partial<SubDimensionWeights[K]>,
  ): void {
    const current = this.subDimensionWeights[dimension];
    const updated = { ...current, ...newWeights };
    
    // 验证归一化
    const values = Object.values(updated) as number[];
    const sum = values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.001) {
      throw new Error(`维度 ${dimension} 的子权重和 ${sum} 必须等于 1`);
    }
    
    this.subDimensionWeights[dimension] = updated as SubDimensionWeights[K];
    this.logger.log(`[HierarchicalUtility] 更新 ${dimension} 子权重`);
  }

  /**
   * 评估分层效用
   * 
   * 实现公理二：分层组合
   * DimensionScoreₖ = Σ αₖⱼ × subScoreⱼ
   * Utility = Σ βₖ × DimensionScoreₖ
   */
  evaluate(subScores: SubDimensionScoresInput): HierarchicalEvaluationResult {
    // 1. 验证所有分数在 [0,1] 范围内（公理一）
    this.validateAllScores(subScores);
    
    // 2. 计算顶层维度分数 (Σ αₖⱼ × subScoreⱼ)
    const dimensionScores = this.computeDimensionScores(subScores);
    
    // 3. 计算加权贡献
    const weightedContributions = {
      safety: dimensionScores.safety * this.topLevelWeights.safety,
      experience: dimensionScores.experience * this.topLevelWeights.experience,
      efficiency: dimensionScores.efficiency * this.topLevelWeights.efficiency,
      philosophy: dimensionScores.philosophy * this.topLevelWeights.philosophy,
    };
    
    // 4. 计算总效用 (Σ βₖ × DimensionScoreₖ)
    const totalUtility = 
      weightedContributions.safety +
      weightedContributions.experience +
      weightedContributions.efficiency +
      weightedContributions.philosophy;
    
    return {
      totalUtility,
      dimensionScores,
      weightedContributions,
      weights: {
        topLevel: { ...this.topLevelWeights },
        subDimension: JSON.parse(JSON.stringify(this.subDimensionWeights)),
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  /**
   * 带稳健性评估的完整评估（公理五）
   */
  evaluateWithRobustness(
    subScoreSamples: SubDimensionScoresInput[],
    feasibilityProb: number,
    robustnessConstraints: RobustnessConstraints = DEFAULT_ROBUSTNESS_CONSTRAINTS,
  ): HierarchicalEvaluationResult {
    // 对所有样本计算效用
    const utilities = subScoreSamples.map(scores => {
      const result = this.evaluate(scores);
      return result.totalUtility;
    });
    
    // 计算稳健性
    const robustness = evaluateRobustness(utilities, feasibilityProb, robustnessConstraints);
    
    // 使用第一个样本的详细分解
    const baseResult = this.evaluate(subScoreSamples[0]);
    
    return {
      ...baseResult,
      totalUtility: robustness.expectedUtility,
      robustness,
    };
  }

  /**
   * 验证所有分数在 [0,1] 范围内
   */
  private validateAllScores(scores: SubDimensionScoresInput): void {
    const allScores = [
      ...Object.values(scores.safety),
      ...Object.values(scores.experience),
      ...Object.values(scores.efficiency),
      ...Object.values(scores.philosophy),
    ];
    
    for (const score of allScores) {
      if (score < 0 || score > 1) {
        throw new Error(`分数 ${score} 违反公理一：必须在 [0,1] 范围内`);
      }
    }
  }

  /**
   * 计算顶层维度分数
   */
  private computeDimensionScores(
    subScores: SubDimensionScoresInput,
  ): HierarchicalEvaluationResult['dimensionScores'] {
    return {
      safety: this.weightedSum([
        { score: subScores.safety.physicalSafety, weight: this.subDimensionWeights.safety.physicalSafety },
        { score: subScores.safety.weatherSafety, weight: this.subDimensionWeights.safety.weatherSafety },
        { score: subScores.safety.terrainSafety, weight: this.subDimensionWeights.safety.terrainSafety },
        { score: subScores.safety.complianceSafety, weight: this.subDimensionWeights.safety.complianceSafety },
      ]),
      experience: this.weightedSum([
        { score: subScores.experience.poiCoverage, weight: this.subDimensionWeights.experience.poiCoverage },
        { score: subScores.experience.experienceQuality, weight: this.subDimensionWeights.experience.experienceQuality },
        { score: subScores.experience.scenicValue, weight: this.subDimensionWeights.experience.scenicValue },
      ]),
      efficiency: this.weightedSum([
        { score: subScores.efficiency.timeEfficiency, weight: this.subDimensionWeights.efficiency.timeEfficiency },
        { score: subScores.efficiency.budgetEfficiency, weight: this.subDimensionWeights.efficiency.budgetEfficiency },
        { score: subScores.efficiency.fatigueManagement, weight: this.subDimensionWeights.efficiency.fatigueManagement },
        { score: subScores.efficiency.pacingBalance, weight: this.subDimensionWeights.efficiency.pacingBalance },
      ]),
      philosophy: this.weightedSum([
        { score: subScores.philosophy.routePhilosophyAlignment, weight: this.subDimensionWeights.philosophy.routePhilosophyAlignment },
        { score: subScores.philosophy.structuralIntegrity, weight: this.subDimensionWeights.philosophy.structuralIntegrity },
      ]),
    };
  }

  /**
   * 加权求和
   */
  private weightedSum(items: Array<{ score: number; weight: number }>): number {
    return items.reduce((sum, item) => sum + item.score * item.weight, 0);
  }
}
