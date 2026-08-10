/**
 * InterventionEvaluation — Over / Missed / Too Early / Too Late。
 */

import type { InterventionCandidateV1 } from './intervention-candidate.util';
import type { InterventionGroundTruthV1 } from './intervention-ground-truth.util';
import type { TimingEvaluationV1 } from './useful-intervention-window.util';

export const INTERVENTION_EVALUATION_SCHEMA =
  'nara.intervention_evaluation@v1' as const;

export type InterventionEvalKind =
  | 'CORRECT_INTERRUPT'
  | 'CORRECT_SUPPRESS'
  | 'OVER_INTERVENTION'
  | 'MISSED_INTERVENTION'
  | 'TOO_EARLY'
  | 'TOO_LATE'
  | 'UNCERTAIN_SKIP';

export type InterventionEvaluationV1 = {
  schemaId: typeof INTERVENTION_EVALUATION_SCHEMA;
  version: 1;
  evaluationId: string;
  candidateId: string;
  kind: InterventionEvalKind;
  surfaceLevel: InterventionCandidateV1['surfaceLevel'];
  groundTruthLabel: InterventionGroundTruthV1['label'];
  notesZh: string[];
};

/**
 * 对照人工 GT + Timing 识别过度/漏报/过早/过晚。
 */
export function evaluateInterventionCandidate(input: {
  candidate: InterventionCandidateV1;
  groundTruth: InterventionGroundTruthV1;
  timing?: TimingEvaluationV1 | null;
}): InterventionEvaluationV1 {
  if (input.groundTruth.candidateId !== input.candidate.candidateId) {
    throw new Error('[InterventionEval] candidateId_mismatch');
  }

  const surface = input.candidate.surfaceLevel;
  const gt = input.groundTruth.label;
  const notesZh: string[] = [];
  let kind: InterventionEvalKind;

  if (gt === 'UNCERTAIN') {
    kind = 'UNCERTAIN_SKIP';
    notesZh.push('人工标记 UNCERTAIN：不计入 Over/Miss 硬统计');
  } else if (input.timing?.kind === 'TOO_EARLY') {
    kind = 'TOO_EARLY';
    notesZh.push(input.timing.reasonZh);
  } else if (input.timing?.kind === 'TOO_LATE') {
    kind = 'TOO_LATE';
    notesZh.push(input.timing.reasonZh);
  } else if (gt === 'SHOULD_INTERRUPT') {
    if (surface === 'INTERRUPT_CANDIDATE') {
      kind = 'CORRECT_INTERRUPT';
      notesZh.push('系统候选打断与 GT 一致');
    } else {
      kind = 'MISSED_INTERVENTION';
      notesZh.push('GT 认为应打断，系统未升到 INTERRUPT_CANDIDATE');
    }
  } else {
    /** SHOULD_NOT_INTERRUPT */
    if (surface === 'INTERRUPT_CANDIDATE') {
      kind = 'OVER_INTERVENTION';
      notesZh.push('GT 认为不应打断，系统仍标 INTERRUPT_CANDIDATE（过度打扰）');
    } else {
      kind = 'CORRECT_SUPPRESS';
      notesZh.push('正确抑制打断（Useful ≠ Worth Interrupting）');
    }
  }

  return {
    schemaId: INTERVENTION_EVALUATION_SCHEMA,
    version: 1,
    evaluationId: `ieval_${input.candidate.candidateId}`,
    candidateId: input.candidate.candidateId,
    kind,
    surfaceLevel: surface,
    groundTruthLabel: gt,
    notesZh,
  };
}

export type InterventionQualityMetricsV1 = {
  n: number;
  overInterventionRate: number;
  missedInterventionRate: number;
  tooEarlyRate: number;
  tooLateRate: number;
  correctRate: number;
  passed: boolean;
  reasonsZh: string[];
  notifyUserStillForbidden: true;
  pushStillForbidden: true;
  autoActionStillForbidden: true;
};

export function summarizeInterventionEvaluations(input: {
  evaluations: InterventionEvaluationV1[];
  minSamples?: number;
  maxOverRate?: number;
  maxMissRate?: number;
  maxTooEarlyRate?: number;
  maxTooLateRate?: number;
  minCorrectRate?: number;
}): InterventionQualityMetricsV1 {
  const minN = input.minSamples ?? 5;
  const scored = input.evaluations.filter((e) => e.kind !== 'UNCERTAIN_SKIP');
  const n = scored.length;
  const rate = (k: InterventionEvalKind) =>
    n === 0 ? 0 : scored.filter((e) => e.kind === k).length / n;

  const overInterventionRate = rate('OVER_INTERVENTION');
  const missedInterventionRate = rate('MISSED_INTERVENTION');
  const tooEarlyRate = rate('TOO_EARLY');
  const tooLateRate = rate('TOO_LATE');
  const correctRate =
    n === 0
      ? 0
      : scored.filter(
          (e) => e.kind === 'CORRECT_INTERRUPT' || e.kind === 'CORRECT_SUPPRESS',
        ).length / n;

  const reasonsZh: string[] = [];
  if (n < minN) reasonsZh.push(`可比样本不足 ${n} < ${minN}`);
  if (overInterventionRate > (input.maxOverRate ?? 0.25)) {
    reasonsZh.push(`Over-intervention 过高 ${overInterventionRate.toFixed(2)}`);
  }
  if (missedInterventionRate > (input.maxMissRate ?? 0.35)) {
    reasonsZh.push(`Missed-intervention 过高 ${missedInterventionRate.toFixed(2)}`);
  }
  if (tooEarlyRate > (input.maxTooEarlyRate ?? 0.3)) {
    reasonsZh.push(`Too Early 过高 ${tooEarlyRate.toFixed(2)}`);
  }
  if (tooLateRate > (input.maxTooLateRate ?? 0.3)) {
    reasonsZh.push(`Too Late 过高 ${tooLateRate.toFixed(2)}`);
  }
  if (correctRate < (input.minCorrectRate ?? 0.55)) {
    reasonsZh.push(`Correct 率过低 ${correctRate.toFixed(2)}`);
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'Intervention Quality：打断价值与时机可接受；仍禁止 Notification/Push/Auto Apply',
    );
  }

  return {
    n,
    overInterventionRate,
    missedInterventionRate,
    tooEarlyRate,
    tooLateRate,
    correctRate,
    passed,
    reasonsZh,
    notifyUserStillForbidden: true,
    pushStillForbidden: true,
    autoActionStillForbidden: true,
  };
}
