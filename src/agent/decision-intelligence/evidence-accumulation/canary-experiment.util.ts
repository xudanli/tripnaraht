/**
 * CanaryExperiment — 固定 Candidate / Production / DecisionKey / Scope / Exposure / Success / Rollback。
 * 原则：Canary Passed ≠ Policy Proven。
 */

import type { DecisionCanaryScopeV1 } from '../canary/decision-canary-controller.util';
import {
  createDecisionCanaryController,
  type DecisionCanaryControllerV1,
} from '../canary/decision-canary-controller.util';

export const CANARY_EXPERIMENT_SCHEMA = 'nara.canary_experiment@v1' as const;

export type CanaryExperimentStatus =
  | 'DRAFT'
  | 'RUNNING'
  | 'PAUSED'
  | 'KILLED'
  | 'COMPLETED'
  | 'FAILED';

export type CanaryExperimentSuccessCriteria = {
  minEligibleSamples: number;
  minObserveDays: number;
  requireOutcomeEvidence: true;
  requireSafetyFeasibilityZeroRegression: true;
  minOutcomeOrAcceptanceDelta: number;
};

export type CanaryExperimentRollbackCriteria = {
  onSafetyRegression: true;
  onHardConstraintBreach: true;
  onUnauthorizedMutation: true;
  onFeasibilityRegression: true;
};

export type CanaryExperimentV1 = {
  schemaId: typeof CANARY_EXPERIMENT_SCHEMA;
  version: 1;
  experimentId: string;
  labelZh: string;
  status: CanaryExperimentStatus;
  decisionKey: string;
  productionPolicyId: string;
  candidatePolicyId: string;
  scope: DecisionCanaryScopeV1;
  controller: DecisionCanaryControllerV1;
  exposure: {
    trafficFraction: number;
    startedAt?: string;
    endsAtEarliest?: string;
  };
  success: CanaryExperimentSuccessCriteria;
  rollback: CanaryExperimentRollbackCriteria;
  /** 显式：实验通过 ≠ Policy 已证明 */
  canaryPassedIsNotPolicyProven: true;
};

export function createCanaryExperiment(input: {
  experimentId?: string;
  labelZh: string;
  decisionKey: string;
  productionPolicyId: string;
  candidatePolicyId: string;
  scope?: Partial<DecisionCanaryScopeV1>;
  minEligibleSamples?: number;
  minObserveDays?: number;
  minOutcomeOrAcceptanceDelta?: number;
}): CanaryExperimentV1 {
  const trafficFraction = Math.max(
    0,
    Math.min(1, input.scope?.trafficFraction ?? 0.05),
  );
  const controller = createDecisionCanaryController({
    ...input.scope,
    decisionKeys: input.scope?.decisionKeys ?? [input.decisionKey],
    trafficFraction,
    maxRiskLevel: input.scope?.maxRiskLevel ?? 'LOW',
  });
  return {
    schemaId: CANARY_EXPERIMENT_SCHEMA,
    version: 1,
    experimentId: input.experimentId ?? `exp_${input.decisionKey}_${Date.now()}`,
    labelZh: input.labelZh,
    status: 'DRAFT',
    decisionKey: input.decisionKey,
    productionPolicyId: input.productionPolicyId,
    candidatePolicyId: input.candidatePolicyId,
    scope: controller.scope,
    controller,
    exposure: { trafficFraction },
    success: {
      minEligibleSamples: input.minEligibleSamples ?? 30,
      minObserveDays: input.minObserveDays ?? 7,
      requireOutcomeEvidence: true,
      requireSafetyFeasibilityZeroRegression: true,
      minOutcomeOrAcceptanceDelta: input.minOutcomeOrAcceptanceDelta ?? 0.02,
    },
    rollback: {
      onSafetyRegression: true,
      onHardConstraintBreach: true,
      onUnauthorizedMutation: true,
      onFeasibilityRegression: true,
    },
    canaryPassedIsNotPolicyProven: true,
  };
}

export function startCanaryExperiment(
  exp: CanaryExperimentV1,
  now = new Date(),
): CanaryExperimentV1 {
  const ends = new Date(now);
  ends.setUTCDate(ends.getUTCDate() + exp.success.minObserveDays);
  return {
    ...exp,
    status: 'RUNNING',
    exposure: {
      ...exp.exposure,
      startedAt: now.toISOString(),
      endsAtEarliest: ends.toISOString(),
    },
  };
}
