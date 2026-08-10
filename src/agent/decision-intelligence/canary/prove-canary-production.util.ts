/**
 * Production Canary DoD 证明：
 * 在真实 Eligible Sample 上，Safety/Feasibility 零退化前提下，
 * Outcome 或用户决策质量优于 Production。
 * Offline Better ≠ Production Better。
 */

import type { CanaryCandidateEvaluationV1 } from './canary-candidate-evaluation.util';
import type { SampleEligibilityResult } from './sample-eligibility.util';

export const CANARY_PRODUCTION_PROOF_SCHEMA =
  'nara.canary_production_proof@v1' as const;

export type CanaryProductionProofV1 = {
  schemaId: typeof CANARY_PRODUCTION_PROOF_SCHEMA;
  version: 1;
  provenBetterInProduction: boolean;
  safetyFeasibilityZeroRegression: boolean;
  eligibleSampleCount: number;
  ineligibleExcluded: number;
  productionAggregate: number;
  candidateAggregate: number;
  outcomeOrAcceptanceBetter: boolean;
  reasonsZh: string[];
  offlineBetterIsNotProductionBetter: true;
};

export type CanaryPairedSample = {
  eligibility: SampleEligibilityResult;
  production: CanaryCandidateEvaluationV1;
  candidate: CanaryCandidateEvaluationV1;
};

/**
 * 仅统计 Eligible Sample；要求双侧同 snapshotId。
 */
export function proveCanaryBetterInProduction(input: {
  pairs: CanaryPairedSample[];
}): CanaryProductionProofV1 {
  const reasons: string[] = [];
  const eligible = input.pairs.filter((p) => p.eligibility.eligible);
  const ineligibleExcluded = input.pairs.length - eligible.length;

  if (eligible.length === 0) {
    return {
      schemaId: CANARY_PRODUCTION_PROOF_SCHEMA,
      version: 1,
      provenBetterInProduction: false,
      safetyFeasibilityZeroRegression: false,
      eligibleSampleCount: 0,
      ineligibleExcluded,
      productionAggregate: 0,
      candidateAggregate: 0,
      outcomeOrAcceptanceBetter: false,
      reasonsZh: ['无 Eligible Sample，不能证明生产更优（Offline≠Production）'],
      offlineBetterIsNotProductionBetter: true,
    };
  }

  let safetyFeasibilityZeroRegression = true;
  for (const p of eligible) {
    if (p.production.snapshotId !== p.candidate.snapshotId) {
      reasons.push(`snapshot_mismatch:${p.production.snapshotId}`);
      safetyFeasibilityZeroRegression = false;
    }
    if (p.candidate.safetyRegressed || p.candidate.feasibilityRegressed) {
      safetyFeasibilityZeroRegression = false;
      reasons.push(
        `regression on ${p.candidate.decisionKey}: safety=${p.candidate.safetyRegressed} feasibility=${p.candidate.feasibilityRegressed}`,
      );
    }
    if (
      p.candidate.metrics.safety + 1e-9 < p.production.metrics.safety ||
      p.candidate.metrics.feasibility + 1e-9 < p.production.metrics.feasibility
    ) {
      safetyFeasibilityZeroRegression = false;
      reasons.push(`absolute safety/feasibility below production on ${p.candidate.decisionKey}`);
    }
  }

  const productionAggregate =
    eligible.reduce((s, p) => s + p.production.aggregateScore, 0) /
    eligible.length;
  const candidateAggregate =
    eligible.reduce((s, p) => s + p.candidate.aggregateScore, 0) /
    eligible.length;

  const prodOutcomeAcc =
    eligible.reduce(
      (s, p) =>
        s + (p.production.metrics.outcome + p.production.metrics.acceptance) / 2,
      0,
    ) / eligible.length;
  const candOutcomeAcc =
    eligible.reduce(
      (s, p) =>
        s + (p.candidate.metrics.outcome + p.candidate.metrics.acceptance) / 2,
      0,
    ) / eligible.length;

  const outcomeOrAcceptanceBetter = candOutcomeAcc > prodOutcomeAcc + 0.02;
  const provenBetterInProduction =
    safetyFeasibilityZeroRegression &&
    outcomeOrAcceptanceBetter &&
    candidateAggregate > productionAggregate + 0.01;

  if (!safetyFeasibilityZeroRegression) {
    reasons.push('Safety/Feasibility 非零退化 → 不得宣称生产更优');
  }
  if (outcomeOrAcceptanceBetter) {
    reasons.push(
      `Outcome/Acceptance Candidate ${candOutcomeAcc.toFixed(3)} > Production ${prodOutcomeAcc.toFixed(3)}`,
    );
  } else {
    reasons.push('Outcome/Acceptance 未优于 Production');
  }
  reasons.push(
    `aggregate cand=${candidateAggregate.toFixed(3)} prod=${productionAggregate.toFixed(3)}`,
  );
  reasons.push('Offline Better ≠ Production Better：仅 Eligible 真实样本计入');

  return {
    schemaId: CANARY_PRODUCTION_PROOF_SCHEMA,
    version: 1,
    provenBetterInProduction,
    safetyFeasibilityZeroRegression,
    eligibleSampleCount: eligible.length,
    ineligibleExcluded,
    productionAggregate,
    candidateAggregate,
    outcomeOrAcceptanceBetter,
    reasonsZh: reasons,
    offlineBetterIsNotProductionBetter: true,
  };
}
