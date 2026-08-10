/**
 * Decision Replay Harness — 历史 WorldState + Evidence 重跑 Runtime，对比 Actual Outcome。
 * 不新增 Runtime；runtimeFn 由调用方注入当前 Runtime 纯函数。
 * Learning 只产出 signal，不改 Policy。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../travel-world-state.types';
import type { TravelWorldStateWithQualityV1 } from './world-state-quality.util';
import {
  attachTravelWorldStateQuality,
  checkTravelWorldStateConsistency,
} from './world-state-quality.util';
import {
  emitLearningSignal,
  assertLearningDoesNotMutatePolicy,
  projectLearningSignalForObservability,
  type LearningSignalV1,
} from './learning-signal.registry';

export type DecisionReplayRuntimeInput = {
  worldState: TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  questionZh?: string;
};

export type DecisionReplayRuntimeOutput = {
  verdictOrChoiceZh: string;
  confidence?: number;
  notesZh?: string[];
};

export type DecisionReplayActualOutcome = {
  valueZh: string;
  source?: string;
  at?: string;
};

export type DecisionReplayResultV1 = {
  ok: boolean;
  consistencyOk: boolean;
  predictedZh: string;
  actualZh: string;
  match: boolean;
  deltaZh: string;
  learningSignal: LearningSignalV1;
  learningSignalObs: Record<string, unknown>;
  /** 显式：未修改任何 Policy */
  policyMutationAttempted: false;
  policyMutationDeniedTargets: string[];
};

/**
 * 用历史状态+证据重跑当前 Runtime，并与 Actual Outcome 对比。
 */
export function runDecisionReplay(input: {
  historicalWorldState: TravelWorldStateV1 | TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  questionZh?: string;
  actualOutcome: DecisionReplayActualOutcome;
  runtimeFn: (i: DecisionReplayRuntimeInput) => DecisionReplayRuntimeOutput;
}): DecisionReplayResultV1 {
  const world =
    'quality' in input.historicalWorldState
      ? (input.historicalWorldState as TravelWorldStateWithQualityV1)
      : attachTravelWorldStateQuality(input.historicalWorldState);

  const consistency = checkTravelWorldStateConsistency(world);
  const predicted = input.runtimeFn({
    worldState: world,
    evidence: input.evidence,
    questionZh: input.questionZh,
  });

  const predictedZh = predicted.verdictOrChoiceZh.trim();
  const actualZh = input.actualOutcome.valueZh.trim();
  const match =
    predictedZh === actualZh ||
    predictedZh.includes(actualZh) ||
    actualZh.includes(predictedZh);
  const deltaZh = match
    ? '一致'
    : `预测「${predictedZh}」vs 实际「${actualZh}」`;

  const deniedTargets = (['CONTRACT', 'RULE', 'GATE', 'SOLVER_WEIGHT'] as const)
    .map((t) => assertLearningDoesNotMutatePolicy(t))
    .filter((r) => !r.ok)
    .map((r) => (r as { target: string }).target);

  const learningSignal = emitLearningSignal({
    kind: 'DECISION_REPLAY_DELTA',
    tripId: world.trip.tripId,
    summaryZh: deltaZh,
    allowedUse: 'REPLAY_COMPARE',
    payload: {
      predicted: predictedZh,
      actual: actualZh,
      match,
      consistency_ok: consistency.ok,
      consistency_issues: consistency.issues.map((i) => i.code),
      evidence_count: input.evidence.length,
      world_freshness: world.quality.overallFreshness,
      world_confidence: world.quality.overallConfidence,
    },
  });

  return {
    ok: consistency.ok,
    consistencyOk: consistency.ok,
    predictedZh,
    actualZh,
    match,
    deltaZh,
    learningSignal,
    learningSignalObs: projectLearningSignalForObservability(learningSignal),
    policyMutationAttempted: false,
    policyMutationDeniedTargets: deniedTargets,
  };
}
