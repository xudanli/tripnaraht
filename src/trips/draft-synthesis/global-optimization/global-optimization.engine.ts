import type { TravelPersona, TravelPersonaType } from '../persona-policy/travel-persona.types';
import type { ExecutionPolicy } from '../persona-policy/execution-policy.types';
import type { TripReward } from './trip-reward.types';
import type { SystemPolicyWeights } from './system-policy-weights.types';

const CLAMP = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function normalizeTriplet(llm: number, algo: number, solver: number): Pick<ExecutionPolicy, 'llmWeight' | 'algoWeight' | 'solverWeight'> {
  const s = llm + algo + solver;
  const n = s > 0 ? s : 1;
  return { llmWeight: llm / n, algoWeight: algo / n, solverWeight: solver / n };
}

export function createDefaultSystemPolicyWeights(): SystemPolicyWeights {
  return {
    engineWeights: { llm: 1, algo: 1, solver: 1 },
    constraintWeights: { distance: 1, fatigue: 1, timing: 1, cost: 1 },
    personaWeights: {},
    schemaVersion: 1,
  };
}

/** 标量合成奖励，用于简单梯度更新（中心在 0.5）。 */
export function tripRewardComposite(r: TripReward): number {
  const f = 1 - r.frictionScore;
  return (
    0.3 * r.satisfactionScore +
    0.2 * f +
    0.2 * r.executionStability +
    0.15 * r.preferenceAlignment +
    0.15 * r.completionRate
  );
}

function constraintPriorityMerged(persona: TravelPersona, sys: SystemPolicyWeights): string[] {
  const c = persona.constraintSensitivity;
  const w = sys.constraintWeights;
  const timing = c.timing * w.timing;
  const distance = c.distance * w.distance;
  const fatigue = c.fatigue * w.fatigue;
  const cost = c.cost * w.cost;
  const entries: [string, number][] = [
    ['timing', timing],
    ['distance', distance],
    ['fatigue', fatigue],
    ['cost', cost],
  ];
  return [...entries].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/**
 * 将系统层权重折叠进单次 ExecutionPolicy（引擎三维 + 约束排序）。
 * 不改变 simulationLevel / gateProfile / repair（离散策略仍由 Persona 主导）。
 */
export function mergeExecutionPolicyWithGlobal(
  base: ExecutionPolicy,
  persona: TravelPersona,
  system: SystemPolicyWeights,
): ExecutionPolicy {
  const pw = system.personaWeights[persona.type] ?? 1;
  const ew = system.engineWeights;
  const rawLlm = persona.engineWeights.llm * ew.llm * pw;
  const rawAlgo = persona.engineWeights.algo * ew.algo * pw;
  const rawSolver = persona.engineWeights.solver * ew.solver * pw;
  const w = normalizeTriplet(rawLlm, rawAlgo, rawSolver);

  return {
    ...base,
    ...w,
    constraintPriorityOrder: constraintPriorityMerged(persona, system),
  };
}

/**
 * 简化全局更新：以合成奖励相对 0.5 的偏差调整 personaWeights；可选按 dominantEngine 微调 engineWeights。
 * friction 高时略降 fatigue 约束倍率（减轻「疲劳约束过苛」假设）。
 */
export function updateSystemPolicyWeightsFromTripReward(
  prev: SystemPolicyWeights,
  args: {
    reward: TripReward;
    personaType: TravelPersonaType;
    alpha?: number;
  },
): SystemPolicyWeights {
  const alpha = args.alpha ?? 0.04;
  const composite = tripRewardComposite(args.reward);
  const c = composite - 0.5;
  const next: SystemPolicyWeights = JSON.parse(JSON.stringify(prev)) as SystemPolicyWeights;

  const pk = args.personaType;
  next.personaWeights[pk] = CLAMP((next.personaWeights[pk] ?? 1) + alpha * c, 0.55, 1.65);

  const de = args.reward.dominantEngine;
  if (de === 'LLM') {
    next.engineWeights.llm = CLAMP(next.engineWeights.llm + alpha * c * 0.35, 0.55, 1.45);
    next.engineWeights.algo = CLAMP(next.engineWeights.algo - alpha * c * 0.18, 0.55, 1.45);
  } else if (de === 'ALGO') {
    next.engineWeights.algo = CLAMP(next.engineWeights.algo + alpha * c * 0.35, 0.55, 1.45);
    next.engineWeights.llm = CLAMP(next.engineWeights.llm - alpha * c * 0.18, 0.55, 1.45);
  }

  if (args.reward.frictionScore > 0.65) {
    next.constraintWeights.fatigue = CLAMP(next.constraintWeights.fatigue - alpha * 0.25, 0.55, 1.45);
  } else if (args.reward.frictionScore < 0.25 && composite > 0.62) {
    next.constraintWeights.fatigue = CLAMP(next.constraintWeights.fatigue + alpha * 0.12, 0.55, 1.45);
  }

  next.schemaVersion = (next.schemaVersion ?? 1) + 1;
  return next;
}
