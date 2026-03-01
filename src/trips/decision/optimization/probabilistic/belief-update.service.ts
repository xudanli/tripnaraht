/**
 * Belief Update Service (POMDP)
 *
 * Phase 3 研究级：POMDP 信念更新
 * b_{t+1}(s_{t+1}) = η O(o_{t+1}|s_{t+1}) ∫ P(s_{t+1}|s_t,a_t) b_t(s_t) ds_t
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.2、docs/DECISION_OS_RESEARCH_UPGRADE_EXPERT_EVALUATION.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ProbabilisticWorldModelContext,
  WorldStateSample,
  WorldStateObservation,
  DecisionAction,
} from './probabilistic-world-model.interface';
import { ProbabilisticWorldModelService } from './probabilistic-world-model.service';
import { IObservationModel } from './observation-model.interface';
import { DefaultObservationModelService } from './default-observation-model.service';

/** 信念状态（离散粒子表示） */
export interface BeliefState {
  /** 粒子/采样 ID */
  particleId: string;
  /** 世界状态采样 */
  sample: WorldStateSample;
  /** 粒子权重（归一化后为概率） */
  weight: number;
}

/** 信念更新输入 */
export interface BeliefUpdateInput {
  /** 当前信念 b_t（粒子集） */
  currentBelief: BeliefState[];
  /** 执行的动作 a_t */
  action: DecisionAction;
  /** 新观测 o_{t+1} */
  observation: WorldStateObservation;
}

/** 信念更新输出 */
export interface BeliefUpdateOutput {
  /** 更新后信念 b_{t+1} */
  updatedBelief: BeliefState[];
  /** 有效粒子数（重采样后） */
  effectiveParticleCount: number;
  /** 观测似然（用于诊断） */
  observationLikelihood?: number;
  /** 归一化常数对数 -log(η)，定理 1 中 η 的显式形式，供诊断 */
  logNormalizationConstant?: number;
}

@Injectable()
export class BeliefUpdateService {
  private readonly logger = new Logger(BeliefUpdateService.name);
  private readonly observationModel: IObservationModel;

  constructor(
    @Optional() private readonly worldModel?: ProbabilisticWorldModelService,
    @Optional() observationModel?: IObservationModel,
  ) {
    this.observationModel =
      observationModel ?? new DefaultObservationModelService();
  }

  /**
   * POMDP 信念更新
   * b_{t+1} = η O(o_{t+1}|s_{t+1}) ∫ P(s_{t+1}|s_t,a_t) b_t ds_t
   *
   * 实现：两阶段
   * 1. 预测：predictOutcome(context, action) → P(s_{t+1}|s_t,a_t) 的 nextState
   * 2. 更新：updateWithObservation(nextState, observation) → 贝叶斯更新
   *
   * 粒子表示：当 currentBelief 为粒子集时，对粒子加权更新
   */
  async updateBelief(
    context: ProbabilisticWorldModelContext,
    input: BeliefUpdateInput,
  ): Promise<BeliefUpdateOutput> {
    if (!this.worldModel) {
      this.logger.warn('[BeliefUpdate] WorldModel 未注入，返回未更新信念');
      return {
        updatedBelief: input.currentBelief,
        effectiveParticleCount: input.currentBelief.length,
      };
    }

    const { currentBelief, action, observation } = input;

    // Step 1: 预测 — P(s_{t+1}|s_t,a_t)
    const pred = this.worldModel.predictOutcome(context, action, {
      includeSamples: Math.max(5, currentBelief.length),
    });
    const predictedSamples = pred.nextStateSamples ?? [];

    // Step 2: 更新 — O(o_{t+1}|s_{t+1})，对粒子重加权
    const particles: BeliefState[] = [];
    const samplesToUse =
      predictedSamples.length > 0
        ? predictedSamples
        : currentBelief.map((p) => p.sample);

    let totalWeight = 0;
    for (let i = 0; i < samplesToUse.length; i++) {
      const sample = samplesToUse[i];
      const priorWeight = currentBelief[i]?.weight ?? 1 / samplesToUse.length;
      const obsLikelihood = this.observationModel.computeLikelihood(
        sample,
        observation,
      );
      const w = priorWeight * obsLikelihood;
      particles.push({
        particleId: `b_${Date.now()}_${i}`,
        sample,
        weight: w,
      });
      totalWeight += w;
    }

    const normalized = particles.map((p) => ({
      ...p,
      weight: totalWeight > 0 ? p.weight / totalWeight : 1 / particles.length,
    }));

    const effN = this.effectiveParticleCount(normalized);
    // η = 1/Z，Z = Σ Ω(o|s_i)·priorWeight_i，故 -log(η) = log(Z)
    const logNormalizationConstant = Math.log(Math.max(totalWeight, 1e-10));

    this.logger.debug(
      `[BeliefUpdate] 完成: particles=${normalized.length} effN=${effN.toFixed(1)}`,
    );

    return {
      updatedBelief: normalized,
      effectiveParticleCount: effN,
      observationLikelihood: totalWeight / Math.max(1, currentBelief.length),
      logNormalizationConstant,
    };
  }

  /**
   * 从 WorldStateSample 创建初始信念（均匀权重）
   */
  createInitialBeliefFromSamples(
    samples: WorldStateSample[],
  ): BeliefState[] {
    const w = 1 / samples.length;
    return samples.map((s, i) => ({
      particleId: `b0_${i}`,
      sample: s,
      weight: w,
    }));
  }

  private effectiveParticleCount(particles: BeliefState[]): number {
    const sumSq = particles.reduce((s, p) => s + p.weight * p.weight, 0);
    return sumSq > 0 ? 1 / sumSq : 0;
  }
}
