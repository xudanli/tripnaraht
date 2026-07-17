/**
 * Harness assertions for the frozen TravelCausalDecision contract.
 * Each standard case must cover: facts → root → chain → temporal → do-nothing
 * → interventions → validation → selection hook → outcome reconciliation slot.
 */

import type { TravelCausalDecision } from '../types/travel-causal-decision.types';
import { TRAVEL_CAUSAL_DECISION_SCHEMA } from '../types/travel-causal-decision.types';
import { DECISION_OUTCOME_SCHEMA } from '../types/decision-outcome.types';
import { getTravelCausalRule } from '../registry/travel-causal-rule.registry';

export interface CausalDecisionHarnessReport {
  ok: boolean;
  errors: string[];
}

export function assertTravelCausalDecisionComplete(
  decision: TravelCausalDecision,
): CausalDecisionHarnessReport {
  const errors: string[] = [];

  if (decision.schema !== TRAVEL_CAUSAL_DECISION_SCHEMA) {
    errors.push(`schema must be ${TRAVEL_CAUSAL_DECISION_SCHEMA}`);
  }
  if (!decision.decisionId) errors.push('decisionId required');
  if (!decision.tripId) errors.push('tripId required');
  if (!decision.observationSummary) errors.push('observationSummary required');
  if (!decision.rootCause?.id) errors.push('rootCause required');
  if (!decision.evidenceRefs?.length) errors.push('evidenceRefs required (facts)');
  if (!decision.causalChain?.length) errors.push('causalChain required (propagation)');

  const tf = decision.temporalForecast;
  if (!tf?.detectedAt) errors.push('temporalForecast.detectedAt required');
  if (tf && (tf.confidence < 0 || tf.confidence > 1)) {
    errors.push('temporalForecast.confidence must be in [0,1]');
  }
  if (!tf?.interventionDeadline) {
    errors.push('temporalForecast.interventionDeadline required (when must act)');
  }
  if (!tf?.assumptions?.length) {
    errors.push('temporalForecast.assumptions required');
  }
  if (tf?.expectedOnsetAt && tf.interventionDeadline) {
    // Soft check: deadline should not be after deterioration when both present
    if (tf.deteriorationAt && tf.interventionDeadline > tf.deteriorationAt) {
      errors.push('interventionDeadline should be at or before deteriorationAt');
    }
  }

  if (decision.baselineOutcome.completionProbability == null) {
    errors.push('baselineOutcome.completionProbability required (do-nothing consequence)');
  }
  if (!decision.doNothingSummary) {
    errors.push('doNothingSummary required');
  }

  if (!decision.interventions?.length || decision.interventions.length < 2) {
    errors.push('at least 2 interventions required');
  }
  for (const opt of decision.interventions ?? []) {
    if (!opt.changes?.length) errors.push(`intervention ${opt.optionId}: changes required`);
    if (!opt.validation?.checks?.length) {
      errors.push(`intervention ${opt.optionId}: validation.checks required`);
    }
    if (opt.expectedOutcome.completionProbability == null) {
      errors.push(`intervention ${opt.optionId}: expectedOutcome.completionProbability required`);
    }
  }

  if (decision.recommendation) {
    const exists = decision.interventions.some(
      (i) => i.optionId === decision.recommendation!.optionId,
    );
    if (!exists) errors.push('recommendation.optionId must reference an intervention');
  }

  if (!decision.contextHash) errors.push('contextHash required');
  if (!decision.ruleVersion) errors.push('ruleVersion required');
  if (!decision.modelVersion) errors.push('modelVersion required');

  if (!decision.outcome) {
    errors.push('outcome slot required (PENDING reconciliation allowed)');
  } else {
    if (decision.outcome.schema !== DECISION_OUTCOME_SCHEMA) {
      errors.push(`outcome.schema must be ${DECISION_OUTCOME_SCHEMA}`);
    }
    if (decision.outcome.decisionId !== decision.decisionId) {
      errors.push('outcome.decisionId must match decisionId');
    }
    if (!decision.outcome.reconciliation) {
      errors.push('outcome.reconciliation required');
    }
  }

  for (const link of decision.causalChain) {
    if (link.ruleId) {
      const rule = getTravelCausalRule(link.ruleId, link.ruleVersion);
      if (!rule) {
        errors.push(`causalChain effect ${link.effectId}: unknown rule ${link.ruleId}@${link.ruleVersion}`);
      } else if (rule.reviewStatus !== 'APPROVED' && rule.reviewStatus !== 'EXPERT_REVIEWED') {
        errors.push(`rule ${link.ruleId} not review-approved (${rule.reviewStatus})`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Full closed-loop checklist labels for docs / reporting. */
export const CAUSAL_CASE_LOOP_STEPS = [
  'facts',
  'rootCause',
  'propagation',
  'temporalDeadlines',
  'doNothingConsequence',
  'interventions',
  'validation',
  'userSelectionHook',
  'ledgerRefSlot',
  'outcomeReconciliation',
] as const;

export type CausalCaseLoopStep = (typeof CAUSAL_CASE_LOOP_STEPS)[number];
