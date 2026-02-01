// src/kpu/services/validation-scoring.service.ts
/**
 * 验证评分服务
 * 
 * 负责计算知识片段和AI输出的综合得分
 */

import { Injectable } from '@nestjs/common';
import { ScoringFactors } from '../types/validation.types';

@Injectable()
export class ValidationScoringService {
  /**
   * 计算综合得分
   * 
   * 权重配置：
   * - 事实检查: 30%
   * - 可信度: 20%
   * - 新鲜度: 15%
   * - 完整性: 15%
   * - 一致性: 10%
   * - 相似度: 10%
   */
  calculateOverallScore(factors: ScoringFactors): number {
    const weights = {
      factCheck: 0.3,
      credibility: 0.2,
      freshness: 0.15,
      completeness: 0.15,
      consistency: 0.1,
      similarity: 0.1,
    };

    // 事实检查得分
    const factCheckScore = factors.factCheck === 'pass' ? 1.0 :
                          factors.factCheck === 'fail' ? 0.0 : 0.5;

    // 一致性得分
    const consistencyScore = factors.consistency === 'consistent' ? 1.0 :
                            factors.consistency === 'inconsistent' ? 0.0 : 0.5;

    // 综合得分
    const overallScore =
      factCheckScore * weights.factCheck +
      factors.credibility * weights.credibility +
      factors.freshness * weights.freshness +
      factors.completeness * weights.completeness +
      consistencyScore * weights.consistency +
      factors.similarity * weights.similarity;

    return Math.max(0, Math.min(1, overallScore));
  }

  /**
   * 计算质量得分（不考虑相似度）
   */
  calculateQualityScore(factors: ScoringFactors): number {
    return (
      factors.credibility * 0.4 +
      factors.freshness * 0.3 +
      factors.completeness * 0.3
    );
  }

  /**
   * 计算可信度得分
   */
  calculateCredibilityScore(factors: ScoringFactors): number {
    return factors.credibility;
  }
}
