/**
 * Round 3 — 体验兑现编排：物理验证 / VERIFY 报告 → PRD Contract + RepairContract
 */

import type { VerificationReport } from '../../../decision/kernel/decision-state.types';
import type { PhysicalEvaluationResult } from '../../../domain/ontology/validator/physical-validator.types';
import { mapPhysicalEvaluationToResult, mapVerificationReportToResult } from '../bridges/verification-result.bridge';
import { buildRepairContractFromVerification } from '../bridges/repair-contract.builder';
import { compileExperienceIntent } from './experience-intent.compiler';
import { buildTripContextFromNlParams } from './experience-understanding.util';
import type { ExperienceFulfillmentState } from '../types/experience-fulfillment-state.types';
import type { ExperienceIntentDigest } from '../types/experience-intent.types';
import type { TripContextSchema } from '../types/trip-context.types';
import type { VerificationScope } from '../types/verification-result.types';

export type ExperienceFulfillmentBuildInput = {
  userMessage?: string;
  partialParams?: Record<string, unknown>;
  experienceIntent?: ExperienceIntentDigest;
  tripContext?: Partial<TripContextSchema>;
  scope?: VerificationScope;
  verificationRunId?: string;
  experienceFulfillmentEstimate?: number;
  scheduleRobustness?: number;
  targetIds?: string[];
};

function resolveExperienceIntent(input: ExperienceFulfillmentBuildInput): ExperienceIntentDigest {
  if (input.experienceIntent) return input.experienceIntent;
  if (input.userMessage?.trim()) {
    return compileExperienceIntent({
      message: input.userMessage,
      tripContext: input.tripContext ?? buildTripContextFromNlParams(input.partialParams),
    });
  }
  return compileExperienceIntent({ message: '' });
}

export function buildExperienceFulfillmentFromVerificationReport(
  report: VerificationReport,
  input: ExperienceFulfillmentBuildInput = {},
): ExperienceFulfillmentState {
  const experienceIntent = resolveExperienceIntent(input);
  const verificationResult = mapVerificationReportToResult(report, {
    verificationRunId: input.verificationRunId,
    scope: input.scope ?? 'TRIP',
    experienceFulfillmentEstimate:
      input.experienceFulfillmentEstimate ??
      estimateExperienceFulfillmentFromIntent(experienceIntent),
    scheduleRobustness: input.scheduleRobustness,
  });
  const repairContract = buildRepairContractFromVerification(
    verificationResult,
    experienceIntent,
    {
      tripContext: input.tripContext ?? buildTripContextFromNlParams(input.partialParams),
      targetIds: input.targetIds,
    },
  );

  return {
    revision: 'v1',
    experienceIntent,
    verificationResult,
    ...(repairContract ? { repairContract } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function enrichPhysicalEvaluation(
  physical: PhysicalEvaluationResult,
  input: ExperienceFulfillmentBuildInput = {},
): PhysicalEvaluationResult {
  const experienceIntent = resolveExperienceIntent(input);
  const verificationResult = mapPhysicalEvaluationToResult(physical, {
    verificationRunId: input.verificationRunId,
    scope: input.scope ?? 'CANDIDATE',
    experienceFulfillmentEstimate:
      input.experienceFulfillmentEstimate ??
      estimateExperienceFulfillmentFromIntent(experienceIntent),
    scheduleRobustness: input.scheduleRobustness,
  });
  const repairContract = buildRepairContractFromVerification(
    verificationResult,
    experienceIntent,
    {
      tripContext: input.tripContext ?? buildTripContextFromNlParams(input.partialParams),
      targetIds: input.targetIds,
      ruleVersion: physical.rule_bundle_id,
    },
  );

  return {
    ...physical,
    experience_fulfillment: {
      revision: 'v1',
      experienceIntent,
      verificationResult,
      ...(repairContract ? { repairContract } : {}),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function estimateExperienceFulfillmentFromIntent(intent: ExperienceIntentDigest): number {
  if (!intent.experienceIntents.length) return 0.5;
  const weighted =
    intent.experienceIntents.reduce((s, i) => s + i.weight, 0) / intent.experienceIntents.length;
  return Math.min(0.95, weighted * (intent.confidence ?? 0.7));
}

export function mergeExperienceFulfillmentState(
  prev: ExperienceFulfillmentState | undefined,
  next: ExperienceFulfillmentState,
): ExperienceFulfillmentState {
  return {
    revision: 'v1',
    experienceIntent: next.experienceIntent ?? prev?.experienceIntent,
    verificationResult: next.verificationResult ?? prev?.verificationResult,
    repairContract: next.repairContract ?? prev?.repairContract,
    candidateValidation: next.candidateValidation ?? prev?.candidateValidation,
    updatedAt: next.updatedAt ?? new Date().toISOString(),
  };
}
