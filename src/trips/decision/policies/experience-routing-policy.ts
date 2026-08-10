/**
 * Experience Routing Policy — 统一广义边权重（VRPTW / CGUS / draft-synthesis 共用）。
 *
 * Cost(i,j) = w1·PhysicalTime + w2·FrictionScore − β·InformationGain
 */

import type { ExperienceFlowModel, ExperienceFlowTempo } from '../models/experience-flow.model';
import type { DraftContractMode } from '../../draft-synthesis/contract/trip-draft-contract.types';

export interface EdgeRoutingInput {
  /** 物理时间强度（分钟）：计划级消费时应为活跃日均驾驶分钟，避免全程合计顶满惩罚 */
  physicalTimeMin: number;
  /** 0–1 转场摩擦（高 = 差） */
  frictionScore: number;
  /** 0–1 信息增益（探索价值） */
  informationGain: number;
}

export interface ExperienceRoutingWeights {
  wPhysicalTime: number;
  wFriction: number;
  betaInformationGain: number;
}

export type ExperienceRoutingMode =
  | DraftContractMode
  | 'EMPATHY_RECOVERY'
  | 'DEFAULT';

export interface ExperienceRoutingPolicyContext {
  tempo?: ExperienceFlowTempo;
  mode?: ExperienceRoutingMode;
  /** 可选：直接注入 ExperienceFlow 第四投影 */
  experienceFlow?: ExperienceFlowModel;
}

const DEFAULT_WEIGHTS: ExperienceRoutingWeights = {
  wPhysicalTime: 1,
  wFriction: 0.45,
  betaInformationGain: 0.12,
};

/**
 * 由 ExperienceFlow / tempo / draft 模式解析路由权重。
 * EMPATHY_RECOVERY → 极大化 wFriction；EXPLORATION → 加大 β。
 */
export function resolveExperienceRoutingWeights(
  ctx: ExperienceRoutingPolicyContext = {},
): ExperienceRoutingWeights {
  const tempo = ctx.experienceFlow?.tempo ?? ctx.tempo ?? 'BALANCED';
  const mode = ctx.mode ?? 'DEFAULT';

  if (tempo === 'EMPATHY_RECOVERY' || mode === 'EMPATHY_RECOVERY') {
    return {
      wPhysicalTime: 0.85,
      wFriction: 1.35,
      betaInformationGain: 0.02,
    };
  }

  if (mode === 'EXPLORATION') {
    const surprise = ctx.experienceFlow?.surpriseBuffer ?? 0.35;
    return {
      wPhysicalTime: 1,
      wFriction: 0.4,
      betaInformationGain: 0.12 + surprise * 0.25,
    };
  }

  if (tempo === 'ACCELERATED') {
    return {
      wPhysicalTime: 1.05,
      wFriction: 0.38,
      betaInformationGain: 0.18,
    };
  }

  if (mode === 'RUNTIME') {
    return {
      wPhysicalTime: 1,
      wFriction: 0.5,
      betaInformationGain: 0.08,
    };
  }

  return { ...DEFAULT_WEIGHTS };
}

/**
 * 广义边权重：物理时间 + 摩擦惩罚 − 信息增益奖励。
 */
export function computeGeneralizedEdgeCost(
  input: EdgeRoutingInput,
  weights: ExperienceRoutingWeights = DEFAULT_WEIGHTS,
): number {
  const physical = Math.max(0, input.physicalTimeMin);
  const friction = Math.max(0, Math.min(1, input.frictionScore));
  const ig = Math.max(0, Math.min(1, input.informationGain));

  return (
    weights.wPhysicalTime * physical +
    weights.wFriction * friction -
    weights.betaInformationGain * ig
  );
}

/**
 * MetaPolicy explorationBeta 与 ExperienceFlow 对齐（CGUS Rollout 入口）。
 */
export function resolveExplorationBetaFromExperienceFlow(
  flow: ExperienceFlowModel | undefined,
  mode: ExperienceRoutingMode = 'DEFAULT',
): number {
  const weights = resolveExperienceRoutingWeights({ experienceFlow: flow, mode });
  return weights.betaInformationGain;
}

/**
 * 由摩擦耐受剩余值推导边级摩擦惩罚倍率（供 VRPTW objective 折叠）。
 */
export function frictionPenaltyMultiplier(flow: ExperienceFlowModel | undefined): number {
  if (!flow) {
    return 1;
  }
  const capacity = Math.max(0, Math.min(1, flow.currentFrictionCapacity));
  return 1 + (1 - capacity) * 1.2;
}
