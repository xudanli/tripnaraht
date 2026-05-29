/**
 * 元决策服务
 *
 * 专利 3.12.3：MetaPolicy 选择规划深度 H、采样预算 N、优化策略
 * 根据 DSO 状态与资源约束，自动选择决策策略
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.12.3
 * 实现方案：docs/DECISION_OS_EXPLORATION_METAPOLICY_IMPLEMENTATION_PLAN.md
 */

import { Injectable, Logger } from '@nestjs/common';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';
import type { ExperienceFlowModel } from '../../models/experience-flow.model';
import {
  resolveExperienceRoutingWeights,
  resolveExplorationBetaFromExperienceFlow,
  type ExperienceRoutingMode,
} from '../../policies/experience-routing-policy';
import {
  IMetaPolicyService,
  MetaPolicyOutput,
  ResourceConstraints,
  OptimizationStrategy,
  MetaPolicyCandidate,
  MarginalAnalysis,
} from './meta-policy.interface';

@Injectable()
export class MetaPolicyService implements IMetaPolicyService {
  private readonly logger = new Logger(MetaPolicyService.name);

  /**
   * 根据 DSO 与资源约束选择优化策略
   */
  selectPolicy(dso: DecisionState, constraints?: ResourceConstraints): MetaPolicyOutput {
    const env = dso.environmentState ?? {};
    const constraintsReport = dso.constraints;
    const candidates = dso.candidates as unknown[] | undefined;
    const planDraft = dso.tripState?.planDraft as { days?: unknown[] } | undefined;
    const phase = dso.systemState?.currentPhase ?? '';

    const candidateCount = candidates?.length ?? (planDraft?.days?.length ? 1 : 0);
    const violationCount = constraintsReport?.violations?.length ?? 0;
    const hasUncertainty =
      env.weatherRisk !== undefined ||
      env.failureRiskLevel !== undefined ||
      dso.uncertaintyProfile?.hasUncertainty === true;
    const uncertaintyLevel = env.weatherRisk ?? (env.failureRiskLevel === 'HIGH' ? 0.7 : env.failureRiskLevel === 'MEDIUM' ? 0.4 : 0.2);

    const latencyBudgetMs = constraints?.latencyBudgetMs;
    const lowPowerMode = constraints?.lowPowerMode === true;

    let horizon: number;
    let sampleSize: number;
    let strategy: OptimizationStrategy;
    let useWorldModelRollout: boolean;
    let useExploration: boolean;
    let explorationBeta: number;

    if (lowPowerMode) {
      horizon = 1;
      sampleSize = 50;
      strategy = 'CGUS';
      useWorldModelRollout = false;
      useExploration = false;
      explorationBeta = 0;
    } else if (latencyBudgetMs !== undefined && latencyBudgetMs < 500) {
      horizon = 1;
      sampleSize = 100;
      strategy = 'CGUS';
      useWorldModelRollout = false;
      useExploration = false;
      explorationBeta = 0;
    } else if (
      uncertaintyLevel > 0.85 ||
      (env.failureRiskLevel === 'HIGH' && uncertaintyLevel > 0.5)
    ) {
      // 极高不确定：拉高 MC 总预算（≈200×候选数 可达千～两千量级）
      sampleSize = 2000;
      horizon = 3;
      strategy = 'CGUS';
      useWorldModelRollout = true;
      useExploration = true;
      explorationBeta = 0.2;
    } else if (uncertaintyLevel > 0.75 || dso.uncertaintyProfile?.entropy01 > 0.7) {
      sampleSize = 1000;
      horizon = 3;
      strategy = 'CGUS';
      useWorldModelRollout = true;
      useExploration = true;
      explorationBeta = 0.18;
    } else if (uncertaintyLevel > 0.6 || hasUncertainty) {
      sampleSize = 500;
      horizon = 2;
      strategy = 'CGUS';
      useWorldModelRollout = violationCount > 0;
      useExploration = true;
      explorationBeta = 0.15;
    } else if (candidateCount > 10) {
      horizon = 2;
      sampleSize = 200;
      strategy = 'HYBRID';
      useWorldModelRollout = true;
      useExploration = true;
      explorationBeta = 0.1;
    } else {
      horizon = 3;
      sampleSize = 200;
      strategy = 'CGUS';
      useWorldModelRollout = phase === 'OPTIMIZE' || phase === 'VERIFY';
      useExploration = false;
      explorationBeta = 0;
    }

    const output: MetaPolicyOutput = {
      horizon,
      sampleSize,
      strategy,
      useWorldModelRollout,
      useExploration,
      explorationBeta,
    };

    const final = this.applyExperienceFlowOverrides(output, dso);
    this.logger.debug(
      `[MetaPolicy] H=${final.horizon} N=${final.sampleSize} strategy=${final.strategy} rollout=${final.useWorldModelRollout} exploration=${final.useExploration}`,
    );
    return final;
  }

  /**
   * ExperienceFlow 第四投影覆盖：EMPATHY_RECOVERY 压制探索，EXPLORATION 对齐 β。
   */
  private applyExperienceFlowOverrides(
    output: MetaPolicyOutput,
    dso: DecisionState,
  ): MetaPolicyOutput {
    const flow = (dso.tripState as { experienceFlow?: ExperienceFlowModel } | undefined)
      ?.experienceFlow;
    if (!flow) {
      return output;
    }

    if (flow.tempo === 'EMPATHY_RECOVERY') {
      return {
        ...output,
        useExploration: false,
        explorationBeta: resolveExplorationBetaFromExperienceFlow(flow, 'EMPATHY_RECOVERY'),
      };
    }

    if (output.useExploration) {
      const beta = resolveExplorationBetaFromExperienceFlow(flow, 'EXPLORATION');
      return {
        ...output,
        explorationBeta: Math.max(output.explorationBeta, beta),
      };
    }

    return output;
  }

  /**
   * ExperienceRoutingPolicy 动态权重矩阵 [w1, w2, β]（与 ExperienceFlow 第四投影对齐）。
   */
  getDynamicWeights(
    flowContext?: ExperienceFlowModel,
    mode?: ExperienceRoutingMode,
  ): { w1: number; w2: number; beta: number } {
    const tempo = flowContext?.tempo;
    const resolvedMode =
      mode ?? (tempo === 'EMPATHY_RECOVERY' ? 'EMPATHY_RECOVERY' : 'DEFAULT');
    const w = resolveExperienceRoutingWeights({
      experienceFlow: flowContext,
      mode: resolvedMode,
    });
    return {
      w1: w.wPhysicalTime,
      w2: w.wFriction,
      beta: w.betaInformationGain,
    };
  }

  /**
   * 专利 3.13.13：M* = argmax E[U] − α·Cost(M)
   */
  selectPolicyWithCost(
    dso: DecisionState,
    options?: { alpha?: number; candidates?: MetaPolicyCandidate[] },
  ): MetaPolicyOutput {
    const alpha = options?.alpha ?? 0.001;
    const candidates = options?.candidates ?? this.buildDefaultCandidates(dso);

    let best: MetaPolicyOutput | null = null;
    let bestScore = -Infinity;

    for (const c of candidates) {
      const util = c.estimatedUtility ?? 0.7;
      const cost = c.estimatedCost ?? c.sampleSize * 0.001 + c.horizon * 0.01;
      const score = util - alpha * cost;
      if (score > bestScore) {
        bestScore = score;
        best = {
          horizon: c.horizon,
          sampleSize: c.sampleSize,
          strategy: c.strategy,
          useWorldModelRollout: c.horizon > 1,
          useExploration: c.sampleSize > 200,
          explorationBeta: c.sampleSize > 200 ? 0.1 : 0,
        };
      }
    }

    return best ?? this.selectPolicy(dso);
  }

  /**
   * 专利 4.14.6：M* = argmax E[U] − α·Cost(M)，MarginalUtility = MarginalCost
   * 边际分析：当 ∂U/∂N ≈ α·∂Cost/∂N 时停止增加 N
   */
  selectPolicyWithMarginalAnalysis(
    dso: DecisionState,
    options?: { alpha?: number; maxIter?: number },
  ): MetaPolicyOutput & { marginalAnalysis?: MarginalAnalysis } {
    const alpha = options?.alpha ?? 0.001;
    const maxIter = options?.maxIter ?? 5;
    const candidates = this.buildDefaultCandidates(dso);

    const marginal = this.computeMarginalAnalysis(candidates);
    const base = this.selectPolicyWithCost(dso, { alpha, candidates });

    let best = base;
    let iter = 0;
    const tolerance = 0.1;

    // 当 |dU_dN - alpha * dCost_dN| < tolerance 时停止
    while (
      iter < maxIter &&
      Math.abs(marginal.dU_dN - alpha * marginal.dCost_dN) > tolerance
    ) {
      const next = this.selectPolicyWithCost(dso, {
        alpha,
        candidates: this.buildExtendedCandidates(dso, iter + 1),
      });
      if (
        (next.sampleSize * 0.001 + next.horizon * 0.01) >
        (best.sampleSize * 0.001 + best.horizon * 0.01) + 0.5
      ) {
        break;
      }
      best = next;
      iter++;
    }

    return {
      ...best,
      marginalAnalysis: marginal,
    };
  }

  private computeMarginalAnalysis(candidates: MetaPolicyCandidate[]): MarginalAnalysis {
    const sortedByN = [...candidates].sort((a, b) => a.sampleSize - b.sampleSize);
    const sortedByH = [...candidates].sort((a, b) => a.horizon - b.horizon);

    let dU_dN = 0;
    let dCost_dN = 0;
    if (sortedByN.length >= 2) {
      const [c0, c1] = sortedByN;
      const deltaN = c1.sampleSize - c0.sampleSize || 1;
      dU_dN = ((c1.estimatedUtility ?? 0.7) - (c0.estimatedUtility ?? 0.7)) / deltaN;
      dCost_dN =
        ((c1.estimatedCost ?? 0) - (c0.estimatedCost ?? 0)) / deltaN || 0.001;
    } else {
      dCost_dN = 0.001;
    }

    let dU_dH = 0;
    let dCost_dH = 0;
    if (sortedByH.length >= 2) {
      const [c0, c1] = sortedByH;
      const deltaH = c1.horizon - c0.horizon || 1;
      dU_dH = ((c1.estimatedUtility ?? 0.7) - (c0.estimatedUtility ?? 0.7)) / deltaH;
      dCost_dH =
        ((c1.estimatedCost ?? 0) - (c0.estimatedCost ?? 0)) / deltaH || 0.01;
    } else {
      dCost_dH = 0.01;
    }

    return { dU_dN, dCost_dN, dU_dH, dCost_dH };
  }

  private buildExtendedCandidates(dso: DecisionState, extra: number): MetaPolicyCandidate[] {
    const base = this.selectPolicy(dso);
    return [
      ...this.buildDefaultCandidates(dso),
      {
        horizon: base.horizon + extra,
        sampleSize: base.sampleSize + extra * 50,
        strategy: 'CGUS',
        estimatedUtility: 0.7 + extra * 0.02,
        estimatedCost: (base.sampleSize + extra * 50) * 0.001 + (base.horizon + extra) * 0.01,
      },
    ];
  }

  private buildDefaultCandidates(dso: DecisionState): MetaPolicyCandidate[] {
    const base = this.selectPolicy(dso);
    return [
      { horizon: 1, sampleSize: 50, strategy: 'CGUS', estimatedUtility: 0.6, estimatedCost: 0.05 },
      { horizon: 2, sampleSize: 200, strategy: 'CGUS', estimatedUtility: 0.7, estimatedCost: 0.2 },
      { horizon: 3, sampleSize: 200, strategy: 'CGUS', estimatedUtility: 0.75, estimatedCost: 0.25 },
      {
        horizon: base.horizon,
        sampleSize: base.sampleSize,
        strategy: base.strategy,
        estimatedUtility: 0.7,
        estimatedCost: base.sampleSize * 0.001 + base.horizon * 0.01,
      },
    ];
  }
}
