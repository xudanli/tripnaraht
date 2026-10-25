/**
 * Build / judge WM Outcome Validation records (pure).
 */

import type {
  DecisionRecommendationView,
  WmOutcomeValidationRecord,
  WorldEvidenceSlice,
} from './wm-outcome-validation.types';
import { WM_OUTCOME_VALIDATION_SCHEMA } from './wm-outcome-validation.types';

/** Minimal impact shape — avoids depending on harness modules from production code. */
export interface OutcomeValidationImpactInput {
  subject: 'ROAD' | 'POI' | string;
  subjectId: string;
  tripId: string;
  tickId: string;
  withoutBridge: {
    gateBlocks: boolean;
    gateRequiresVerification: boolean;
    cgusFeasible: boolean;
    worldSees: string;
  };
  withBridge: {
    gateBlocks: boolean;
    gateRequiresVerification: boolean;
    cgusFeasible: boolean;
    worldSees: string;
  };
  decisionWouldDifferIfBridgeDeleted: boolean;
}

function recFromSlice(
  id: string,
  summary: string,
  slice: OutcomeValidationImpactInput['withoutBridge'],
): DecisionRecommendationView {
  return {
    id,
    summary,
    gateBlocks: slice.gateBlocks,
    gateRequiresVerification: slice.gateRequiresVerification,
    cgusFeasible: slice.cgusFeasible,
    worldSees: slice.worldSees,
  };
}

export function recommendationSummaryFromImpact(
  report: OutcomeValidationImpactInput,
  which: 'without' | 'with',
): string {
  const s = which === 'without' ? report.withoutBridge : report.withBridge;
  if (s.gateBlocks) return `BLOCK_${report.subjectId}`;
  if (s.gateRequiresVerification) return `NEED_CONFIRM_${report.subjectId}`;
  if (!s.cgusFeasible) return `CGUS_INFEASIBLE_${report.subjectId}`;
  return `ALLOW_${report.subjectId}_${s.worldSees}`;
}

export function buildWmOutcomeValidationRecord(input: {
  tripId: string;
  tickId: string;
  impact: OutcomeValidationImpactInput;
  world?: Partial<WorldEvidenceSlice>;
  served: WmOutcomeValidationRecord['served'];
  user: WmOutcomeValidationRecord['user'];
  execution: WmOutcomeValidationRecord['execution'];
  outcome: WmOutcomeValidationRecord['outcome'];
  experience?: WmOutcomeValidationRecord['experience'];
  safety: WmOutcomeValidationRecord['safety'];
  recordedAt?: string;
  recordId?: string;
}): WmOutcomeValidationRecord {
  const impact = input.impact;
  const without = recFromSlice(
    'A',
    recommendationSummaryFromImpact(impact, 'without'),
    impact.withoutBridge,
  );
  const withB = recFromSlice(
    'B',
    recommendationSummaryFromImpact(impact, 'with'),
    impact.withBridge,
  );

  const decisionDiffered = impact.decisionWouldDifferIfBridgeDeleted;
  const verdict = judgeBWasBetter({
    decisionDiffered,
    served: input.served,
    user: input.user,
    execution: input.execution,
    outcome: input.outcome,
    experience: input.experience ?? {},
    safety: input.safety,
    without,
    withB,
  });

  return {
    schemaId: WM_OUTCOME_VALIDATION_SCHEMA,
    recordId:
      input.recordId ??
      `wm_ov_${input.tripId}_${input.tickId}`.slice(0, 120),
    tripId: input.tripId,
    tickId: input.tickId,
    subject:
      impact.subject === 'ROAD' || impact.subject === 'POI'
        ? impact.subject
        : 'OTHER',
    subjectId: impact.subjectId,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    world: {
      freshness: input.world?.freshness ?? 'UNKNOWN',
      authority: input.world?.authority ?? 'UNKNOWN',
      sourceVersion: input.world?.sourceVersion,
    },
    decisionWithoutBridge: without,
    decisionWithBridge: withB,
    served: input.served,
    user: input.user,
    execution: input.execution,
    outcome: input.outcome,
    experience: input.experience ?? {},
    safety: input.safety,
    verdict,
  };
}

export function judgeBWasBetter(input: {
  decisionDiffered: boolean;
  served: WmOutcomeValidationRecord['served'];
  user: WmOutcomeValidationRecord['user'];
  execution: WmOutcomeValidationRecord['execution'];
  outcome: WmOutcomeValidationRecord['outcome'];
  experience: WmOutcomeValidationRecord['experience'];
  safety: WmOutcomeValidationRecord['safety'];
  without: DecisionRecommendationView;
  withB: DecisionRecommendationView;
}): WmOutcomeValidationRecord['verdict'] {
  const rationale: string[] = [];

  if (!input.decisionDiffered) {
    rationale.push('A and B identical — no decision impact to validate');
    return {
      decisionDiffered: false,
      bWasBetter: null,
      rationale,
    };
  }

  rationale.push(
    `A=${input.without.summary} B=${input.withB.summary} served=${input.served}`,
  );

  if (input.served === 'UNKNOWN') {
    rationale.push('served recommendation unknown — cannot score B');
    return { decisionDiffered: true, bWasBetter: null, rationale };
  }

  if (
    input.outcome.success === 'UNKNOWN' &&
    input.experience.regret == null &&
    input.safety.result === 'UNKNOWN'
  ) {
    rationale.push('insufficient outcome/experience/safety evidence');
    return { decisionDiffered: true, bWasBetter: null, rationale };
  }

  let score = 0;

  if (input.served === 'WITH_BRIDGE') {
    if (input.outcome.success === 'SUCCESS') score += 2;
    if (input.outcome.success === 'FAILURE') score -= 2;
    if (input.user.action === 'ACCEPT') score += 1;
    if (input.user.action === 'REJECT') score -= 1;
    if (input.user.action === 'OVERRIDE') score -= 1;
    if (input.execution.repairOccurred) score -= 1;
    if (input.experience.regret === true) score -= 2;
    if (input.experience.regret === false) score += 1;
    if (input.safety.result === 'AVOIDED_RISK') score += 3;
    if (input.safety.result === 'RISK_MATERIALIZED') score -= 3;
    if (input.safety.result === 'UNNECESSARY_INTERVENTION') score -= 1;
  } else {
    if (input.safety.result === 'RISK_MATERIALIZED') {
      rationale.push('served A and risk materialized — B likely better');
      return { decisionDiffered: true, bWasBetter: true, rationale };
    }
    if (input.outcome.success === 'SUCCESS' && input.experience.regret !== true) {
      rationale.push('served A succeeded — B not shown to be better');
      return { decisionDiffered: true, bWasBetter: false, rationale };
    }
    rationale.push('served A with mixed/poor outcome — inconclusive for B');
    return { decisionDiffered: true, bWasBetter: null, rationale };
  }

  const bWasBetter = score > 0 ? true : score < 0 ? false : null;
  rationale.push(`served_B_score=${score}`);
  return { decisionDiffered: true, bWasBetter, rationale };
}
