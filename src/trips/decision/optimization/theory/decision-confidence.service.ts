/**
 * 决策置信度服务
 *
 * 专利 3.13.9：Confidence(a) = 1 − Var(U(a))/Var_max，C = P(U(a) ≥ τ)
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.9
 */

import { Injectable } from '@nestjs/common';
import {
  IDecisionConfidenceService,
  ConfidenceInput,
  ConfidenceMethod,
} from './decision-confidence.interface';

@Injectable()
export class DecisionConfidenceService implements IDecisionConfidenceService {
  /** 默认最大方差（效用范围 [0,1] 时 Var_max ≈ 0.25） */
  private readonly DEFAULT_VAR_MAX = 0.25;

  /**
   * 方差形式：Confidence(a) = 1 − Var(U(a)) / Var_max
   */
  computeConfidenceVariance(variance: number, varMax = this.DEFAULT_VAR_MAX): number {
    const c = 1 - Math.min(1, variance / Math.max(1e-9, varMax));
    return Math.max(0, Math.min(1, c));
  }

  /**
   * 概率形式：Confidence(a) = P(U(a) ≥ τ)
   */
  computeConfidenceProbability(samples: number[], threshold: number): number {
    if (samples.length === 0) return 0.5;
    const count = samples.filter((u) => u >= threshold).length;
    return count / samples.length;
  }

  /**
   * 综合计算
   */
  computeConfidence(input: ConfidenceInput, method: ConfidenceMethod = 'VARIANCE'): number {
    if (method === 'PROBABILITY' && input.utilitySamples?.length && input.threshold !== undefined) {
      return this.computeConfidenceProbability(input.utilitySamples, input.threshold);
    }
    let variance = input.variance;
    if (variance === undefined && input.utilitySamples?.length) {
      const mean = input.utilitySamples.reduce((a, b) => a + b, 0) / input.utilitySamples.length;
      variance =
        input.utilitySamples.reduce((s, u) => s + (u - mean) ** 2, 0) / input.utilitySamples.length;
    }
    if (variance !== undefined) {
      return this.computeConfidenceVariance(variance);
    }
    return 0.5;
  }
}
