/**
 * CGUS — 计划级边路由测度与体验流惩罚（ExperienceRoutingPolicy 消费层）。
 */
import type { CGUSCandidate } from './cgus-search.service';
import type { WorldModelContext } from '../shared/world-model.types';
import type { PlanFeatures } from './plan-features/plan-features.service';
import {
  computeGeneralizedEdgeCost,
  frictionPenaltyMultiplier,
  type EdgeRoutingInput,
  type ExperienceRoutingWeights,
} from '../policies/experience-routing-policy';
import {
  EXPERIENCE_FLOW_SCHEMA_V1,
  type ExperienceFlowModel,
} from '../models/experience-flow.model';

const CLAMP01 = (n: number) => Math.max(0, Math.min(1, n));

export type CgusEdgeRoutingAudit = {
  generalizedCost: number;
  utilityPenalty: number;
  weights: ExperienceRoutingWeights;
  metrics: EdgeRoutingInput;
  tempo: ExperienceFlowModel['tempo'];
};

export function defaultBalancedExperienceFlow(): ExperienceFlowModel {
  return {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    tempo: 'BALANCED',
    heterogeneityIndex: 0.55,
    surpriseBuffer: 0.2,
    currentFrictionCapacity: 0.58,
    narrativeTone: 'balanced_warm',
  };
}

/**
 * 从候选计划 segment 链聚合物理时间 / 摩擦 / 信息增益测度。
 */
export function derivePlanEdgeMetrics(
  candidate: CGUSCandidate,
  worldContext: WorldModelContext,
  planFeatures?: PlanFeatures,
): EdgeRoutingInput {
  const segments = candidate.plan?.segments ?? [];
  let physicalTimeMin = 0;
  let frictionAccum = 0;
  let edgeCount = 0;

  for (const seg of segments) {
    const dist = Number(seg.distanceKm) || 0;
    physicalTimeMin += dist > 0 ? (dist / 55) * 60 : 25;
    const slope = Number(seg.slopePct) || 0;
    const ascent = Number(seg.ascentM) || 0;
    const meta = (seg.metadata ?? {}) as Record<string, unknown>;
    const segType = String(meta.type ?? meta.itemType ?? '').toUpperCase();
    let friction = Math.min(1, slope / 28 * 0.35 + ascent / 900 * 0.35);
    if (segType === 'DRIVE' && meta.fRoad === true) friction += 0.2;
    if (segType === 'TRANSIT') friction += 0.12;
    frictionAccum += friction;
    edgeCount += 1;
  }

  for (let i = 1; i < segments.length; i += 1) {
    const a = segments[i - 1];
    const b = segments[i];
    if ((b.dayIndex ?? 0) !== (a.dayIndex ?? 0)) {
      frictionAccum += 0.18;
      edgeCount += 1;
    }
  }

  const physical = worldContext.physical;
  if (physical?.roadStates?.some((r) => r.status === 'CLOSED')) {
    frictionAccum += 0.35 * Math.max(1, segments.length);
    edgeCount += 1;
  }
  const wind = physical?.climateSeasonality?.typicalWeather?.windSpeedMps ?? 0;
  if (wind > 18) {
    frictionAccum += 0.25 * Math.max(1, segments.length);
    edgeCount += 1;
  }

  const flow = worldContext.experienceFlow ?? defaultBalancedExperienceFlow();
  const frictionMultiplier = frictionPenaltyMultiplier(flow);
  const effortFriction = planFeatures
    ? planFeatures.effort01 * 0.45 + planFeatures.slackTightness01 * 0.25
    : 0.15;

  const avgFriction =
    edgeCount > 0
      ? CLAMP01((frictionAccum / edgeCount) * frictionMultiplier + effortFriction)
      : CLAMP01(effortFriction * frictionMultiplier);

  const softCount =
    candidate.constraintViolations?.filter((v) => v.severity === 'SOFT').length ?? 0;

  return {
    physicalTimeMin: Math.max(1, physicalTimeMin),
    frictionScore: CLAMP01(avgFriction + softCount * 0.04),
    informationGain: CLAMP01(flow.surpriseBuffer * 0.55 + flow.heterogeneityIndex * 0.35),
  };
}

/** 广义成本 → [0, maxPenalty] 效用惩罚（成本越高惩罚越大） */
export function experienceCostToUtilityPenalty(
  generalizedCost: number,
  maxPenalty = 0.42,
  referenceCost = 90,
): number {
  if (!Number.isFinite(generalizedCost) || generalizedCost <= 0) {
    return 0;
  }
  return Math.min(maxPenalty, generalizedCost / referenceCost);
}

/**
 * 评估候选计划在 ExperienceRoutingPolicy 下的组合边成本与效用惩罚。
 */
export function evaluateCandidateExperienceRouting(
  candidate: CGUSCandidate,
  worldContext: WorldModelContext,
  weights: ExperienceRoutingWeights,
  planFeatures?: PlanFeatures,
): CgusEdgeRoutingAudit {
  const flow = worldContext.experienceFlow ?? defaultBalancedExperienceFlow();
  const metrics = derivePlanEdgeMetrics(candidate, worldContext, planFeatures);
  const generalizedCost = Math.max(
    0.1,
    computeGeneralizedEdgeCost(metrics, weights),
  );
  const utilityPenalty = experienceCostToUtilityPenalty(
    generalizedCost,
    flow.tempo === 'EMPATHY_RECOVERY' ? 0.55 : 0.42,
  );
  return {
    generalizedCost,
    utilityPenalty,
    weights,
    metrics,
    tempo: flow.tempo,
  };
}

/**
 * Softmax 采样权重：P ∝ exp(-cost / temperature)
 */
export function softmaxWeightsFromEdgeCosts(
  costs: readonly number[],
  temperature = 1,
): number[] {
  if (!costs.length) return [];
  const t = Math.max(1e-6, temperature);
  const logits = costs.map((c) => Math.exp(-c / t));
  const sum = logits.reduce((s, v) => s + v, 0) || 1;
  return logits.map((v) => v / sum);
}
