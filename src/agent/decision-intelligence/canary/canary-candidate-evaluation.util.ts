/**
 * Candidate Evaluation（Canary）多维指标。
 * Safety / Feasibility / Outcome / Acceptance / Correction / Regret / Latency / Cost
 */

import type { ComparableDecisionSnapshotV1 } from './comparable-snapshot.util';
import type { DecisionRegretV1 } from './decision-regret.util';
import { regretToQualityBonus } from './decision-regret.util';

export const CANARY_CANDIDATE_EVAL_SCHEMA =
  'nara.canary_candidate_evaluation@v1' as const;

export type CanaryMetricScores = {
  safety: number;
  feasibility: number;
  outcome: number;
  acceptance: number;
  correction: number;
  regret: number;
  latency: number;
  cost: number;
};

export type CanaryCandidateEvaluationV1 = {
  schemaId: typeof CANARY_CANDIDATE_EVAL_SCHEMA;
  version: 1;
  evaluationId: string;
  channel: 'PRODUCTION' | 'CANDIDATE';
  snapshotId: string;
  decisionKey: string;
  metrics: CanaryMetricScores;
  /** Safety / Feasibility 是否发生退化（相对对照侧） */
  safetyRegressed: boolean;
  feasibilityRegressed: boolean;
  aggregateScore: number;
};

export type CanaryMetricHints = {
  safetyOk?: boolean;
  feasibilityOk?: boolean;
  outcomeScore?: number;
  userAccepted?: boolean;
  userCorrected?: boolean;
  regret?: DecisionRegretV1 | null;
  latencyMs?: number;
  costUsd?: number;
  /** 对照侧（用于回归检测） */
  baselineSafety?: number;
  baselineFeasibility?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function evaluateCanaryCandidate(input: {
  channel: 'PRODUCTION' | 'CANDIDATE';
  snapshot: ComparableDecisionSnapshotV1;
  hints?: CanaryMetricHints;
  evaluationId?: string;
}): CanaryCandidateEvaluationV1 {
  const h = input.hints ?? {};
  const safety = clamp01(h.safetyOk === false ? 0.2 : h.safetyOk === true ? 1 : 0.85);
  const feasibility = clamp01(
    h.feasibilityOk === false ? 0.25 : h.feasibilityOk === true ? 1 : 0.8,
  );
  const outcome = clamp01(h.outcomeScore ?? 0.5);
  const acceptance = clamp01(h.userAccepted === true ? 1 : h.userAccepted === false ? 0.3 : 0.55);
  const correction = clamp01(h.userCorrected === true ? 0.25 : 0.85);
  const regret = clamp01(
    h.regret ? regretToQualityBonus(h.regret) : 0.75,
  );
  const latency = clamp01(
    typeof h.latencyMs === 'number'
      ? h.latencyMs <= 800
        ? 1
        : h.latencyMs <= 2500
          ? 0.7
          : 0.4
      : 0.7,
  );
  const cost = clamp01(
    typeof h.costUsd === 'number'
      ? h.costUsd <= 0.02
        ? 1
        : h.costUsd <= 0.1
          ? 0.7
          : 0.4
      : 0.7,
  );

  const metrics: CanaryMetricScores = {
    safety,
    feasibility,
    outcome,
    acceptance,
    correction,
    regret,
    latency,
    cost,
  };

  const safetyRegressed =
    typeof h.baselineSafety === 'number' && safety + 1e-9 < h.baselineSafety;
  const feasibilityRegressed =
    typeof h.baselineFeasibility === 'number' &&
    feasibility + 1e-9 < h.baselineFeasibility;

  const aggregateScore = clamp01(
    safety * 0.22 +
      feasibility * 0.18 +
      outcome * 0.18 +
      acceptance * 0.12 +
      correction * 0.08 +
      regret * 0.1 +
      latency * 0.06 +
      cost * 0.06,
  );

  return {
    schemaId: CANARY_CANDIDATE_EVAL_SCHEMA,
    version: 1,
    evaluationId:
      input.evaluationId ??
      `canary_eval_${input.channel}_${input.snapshot.snapshotId}`,
    channel: input.channel,
    snapshotId: input.snapshot.snapshotId,
    decisionKey: input.snapshot.decisionKey,
    metrics,
    safetyRegressed,
    feasibilityRegressed,
    aggregateScore,
  };
}
