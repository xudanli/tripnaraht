/**
 * PromotionEvidenceRequirement — 未达最小有效样本 / 观察周期 / Outcome 证据不得晋升。
 * Canary Passed ≠ Policy Proven。
 */

import type { CanaryExperimentV1 } from './canary-experiment.util';
import type { CanaryProductionProofV1 } from '../canary/prove-canary-production.util';

export const PROMOTION_EVIDENCE_REQUIREMENT_SCHEMA =
  'nara.promotion_evidence_requirement@v1' as const;

export type PromotionEvidenceCheckResult = {
  schemaId: typeof PROMOTION_EVIDENCE_REQUIREMENT_SCHEMA;
  version: 1;
  allowedToPromote: boolean;
  missing: string[];
  detailZh: string[];
  /** 即使 canary 测试通过，也不等于 Policy 已证明 */
  canaryPassedIsNotPolicyProven: true;
};

export function checkPromotionEvidenceRequirement(input: {
  experiment: CanaryExperimentV1;
  eligibleSampleCount: number;
  observeDaysElapsed: number;
  hasOutcomeEvidence: boolean;
  productionProof?: CanaryProductionProofV1 | null;
  /** 单元/离线 canary 测试通过 —— 仍不够 */
  offlineCanaryTestsPassed?: boolean;
}): PromotionEvidenceCheckResult {
  const missing: string[] = [];
  const detailZh: string[] = [];
  const s = input.experiment.success;

  if (input.eligibleSampleCount < s.minEligibleSamples) {
    missing.push('MIN_ELIGIBLE_SAMPLES');
    detailZh.push(
      `eligible ${input.eligibleSampleCount} < required ${s.minEligibleSamples}`,
    );
  }
  if (input.observeDaysElapsed < s.minObserveDays) {
    missing.push('MIN_OBSERVE_DAYS');
    detailZh.push(
      `observeDays ${input.observeDaysElapsed} < required ${s.minObserveDays}`,
    );
  }
  if (s.requireOutcomeEvidence && !input.hasOutcomeEvidence) {
    missing.push('OUTCOME_EVIDENCE');
    detailZh.push('missing outcome evidence');
  }
  if (
    s.requireSafetyFeasibilityZeroRegression &&
    input.productionProof &&
    !input.productionProof.safetyFeasibilityZeroRegression
  ) {
    missing.push('SAFETY_FEASIBILITY_REGRESSION');
    detailZh.push('safety/feasibility regression present');
  }
  if (
    input.productionProof &&
    !input.productionProof.provenBetterInProduction
  ) {
    missing.push('NOT_PROVEN_BETTER_IN_PRODUCTION');
    detailZh.push('not proven better on eligible production samples');
  }
  if (!input.productionProof) {
    missing.push('MISSING_PRODUCTION_PROOF');
    detailZh.push('production proof required (offline better ≠ production better)');
  }

  if (input.offlineCanaryTestsPassed && missing.length > 0) {
    detailZh.push(
      'Canary Passed ≠ Policy Proven：离线/单测通过不能替代晋升证据',
    );
  }

  return {
    schemaId: PROMOTION_EVIDENCE_REQUIREMENT_SCHEMA,
    version: 1,
    allowedToPromote: missing.length === 0,
    missing,
    detailZh,
    canaryPassedIsNotPolicyProven: true,
  };
}
