/**
 * 信息增益服务
 *
 * 专利 3.12.2：U'(a) = U(a) + β·InformationGain(a)
 * Exploration vs Exploitation，主动学习决策
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.12.2
 * 实现方案：docs/DECISION_OS_EXPLORATION_METAPOLICY_IMPLEMENTATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  IInformationGainService,
  InformationGainInput,
  InformationGainMethod,
} from './information-gain.interface';
import { ProbabilisticWorldModelService } from '../probabilistic/probabilistic-world-model.service';
import { DEFAULT_UNCERTAINTY_CONFIG } from '../probabilistic/probabilistic-world-model.interface';

@Injectable()
export class InformationGainService implements IInformationGainService {
  private readonly logger = new Logger(InformationGainService.name);

  constructor(
    @Optional() private readonly probabilisticWorldModel?: ProbabilisticWorldModelService,
  ) {}

  /**
   * 计算信息增益 InformationGain(a)
   * 归一化到 [0, 1]，越高表示执行 a 能带来的信息/不确定性减少越多
   */
  computeInformationGain(
    input: InformationGainInput,
    method: InformationGainMethod = 'PREDICTION_UNCERTAINTY',
  ): number {
    switch (method) {
      case 'PREDICTION_UNCERTAINTY':
        return this.computePredictionUncertainty(input);
      case 'VARIANCE_REDUCTION':
        return this.computeVarianceReduction(input);
      case 'ENTROPY_REDUCTION':
        return this.computeEntropyReduction(input);
      case 'KL_DIVERGENCE':
        return this.computeKLDivergence(input);
      default:
        return this.computePredictionUncertainty(input);
    }
  }

  /**
   * PREDICTION_UNCERTAINTY：1 − feasibilityProbability
   * 预测不确定性越高，信息增益越高（探索高不确定性动作）
   */
  private computePredictionUncertainty(input: InformationGainInput): number {
    if (!this.probabilisticWorldModel) {
      this.logger.debug('[InformationGain] ProbabilisticWorldModel 未注入，返回默认 0.5');
      return 0.5;
    }

    try {
      const probContext = this.probabilisticWorldModel.fromDeterministicModel(
        input.worldContext,
        DEFAULT_UNCERTAINTY_CONFIG,
      );
      const pred = this.probabilisticWorldModel.predictOutcome(probContext, {
        type: 'PLAN_EVALUATION',
        payload: { candidateId: input.candidateId },
      });
      const ig = 1 - pred.feasibilityProbability;
      return Math.max(0, Math.min(1, ig));
    } catch (err) {
      this.logger.warn(`[InformationGain] predictOutcome 失败: ${(err as Error)?.message}`);
      return 0.5;
    }
  }

  /**
   * VARIANCE_REDUCTION：置信区间宽度，方差越大信息增益越高
   * InformationGain(a) = min(1, (upper - lower) / 2)
   */
  private computeVarianceReduction(input: InformationGainInput): number {
    const ci = input.confidenceInterval;
    if (!ci) return 0.5;

    const width = (ci.upper - ci.lower) / 2;
    return Math.max(0, Math.min(1, width));
  }

  /**
   * ENTROPY_REDUCTION：IG(a) = H(b) − E_o[H(b')]
   * 信念熵下降量，用效用样本方差近似（方差越大熵越高）
   */
  private computeEntropyReduction(input: InformationGainInput): number {
    const prior = input.utilitySamples;
    const posterior = input.posteriorSamples;
    if (prior?.length && posterior?.length) {
      const hPrior = this.entropyFromSamples(prior);
      const hPost = this.entropyFromSamples(posterior);
      const ig = Math.max(0, hPrior - hPost);
      return Math.max(0, Math.min(1, ig));
    }
    if (prior?.length) {
      const h = this.entropyFromSamples(prior);
      return Math.max(0, Math.min(1, h));
    }
    const level = input.uncertaintyProfile?.overallLevel;
    if (level !== undefined) return Math.max(0, Math.min(1, level));
    return 0.5;
  }

  /**
   * KL_DIVERGENCE：IG(a) = KL(b' ‖ b)
   * 专利 4.14.5：信息增益严格定义
   */
  private computeKLDivergence(input: InformationGainInput): number {
    const prior = input.utilitySamples;
    const posterior = input.posteriorSamples;
    if (!prior?.length || !posterior?.length) return 0.5;
    const kl = this.klDivergenceFromSamples(prior, posterior);
    return Math.max(0, Math.min(1, kl));
  }

  /** KL(b'‖b) = Σ p'_i log(p'_i/p_i)，使用相同 bin 划分 */
  private klDivergenceFromSamples(prior: number[], posterior: number[]): number {
    const bins = 10;
    const [minP, maxP] = [
      Math.min(...prior, ...posterior),
      Math.max(...prior, ...posterior),
    ];
    const range = maxP - minP || 1;
    const countP = Array(bins).fill(1e-9);
    const countQ = Array(bins).fill(1e-9);
    for (const s of prior) {
      const idx = Math.min(bins - 1, Math.floor(((s - minP) / range) * bins));
      countP[idx]++;
    }
    for (const s of posterior) {
      const idx = Math.min(bins - 1, Math.floor(((s - minP) / range) * bins));
      countQ[idx]++;
    }
    const nP = countP.reduce((a, b) => a + b, 0);
    const nQ = countQ.reduce((a, b) => a + b, 0);
    let kl = 0;
    for (let i = 0; i < bins; i++) {
      const qi = countQ[i] / nQ;
      const pi = countP[i] / nP;
      if (qi > 0) kl += qi * Math.log2((qi + 1e-9) / (pi + 1e-9));
    }
    return kl / Math.log2(bins + 1);
  }

  /** 从样本估计熵 H = -Σ p_i log p_i（离散 bin） */
  private entropyFromSamples(samples: number[]): number {
    if (samples.length < 2) return 0;
    const bins = 10;
    const counts: number[] = Array(bins).fill(0);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const range = max - min || 1;
    for (const s of samples) {
      const idx = Math.min(bins - 1, Math.floor(((s - min) / range) * bins));
      counts[idx]++;
    }
    let h = 0;
    let n = samples.length;
    for (const c of counts) {
      if (c > 0) {
        const p = c / n;
        h -= p * Math.log2(p + 1e-9);
      }
    }
    return h / Math.log2(bins + 1);
  }
}
