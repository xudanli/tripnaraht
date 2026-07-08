import { runPostApplyCoherenceCheck } from '../../../trips/decision-semantics/execution/decision-post-apply-coherence.util';
import type { CreateDecisionResponse } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { DecisionRecord } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';
import { isIllegalAppliedWithIncompleteCoherence } from '../../../trips/decision-semantics/execution/decision-post-apply-coherence.util';

export function assertPartialApplyPathB(input: {
  response: CreateDecisionResponse;
  applyRepairCalls: number;
  validateCalls: number;
}): BlockerAssertionResult[] {
  const { response, applyRepairCalls, validateCalls } = input;
  const illegal = isIllegalAppliedWithIncompleteCoherence({
    recordStatus: response.decision.status,
    executionStatus: response.executionStatus,
    postApplyOutcome: response.postApplyCoherence?.outcome,
  });

  return [
    assertBlockerLayer(
      'api',
      'record_status_partially_applied',
      response.decision.status === 'PARTIALLY_APPLIED',
      'PARTIALLY_APPLIED',
      response.decision.status,
    ),
    assertBlockerLayer(
      'api',
      'execution_status_partially_applied',
      response.executionStatus === 'PARTIALLY_APPLIED',
      'PARTIALLY_APPLIED',
      response.executionStatus,
    ),
    assertBlockerLayer(
      'api',
      'needs_repair_flag_set',
      response.needsRepair === true,
      true,
      response.needsRepair,
    ),
    assertBlockerLayer(
      'decision_semantics',
      'apply_repair_still_ran_once',
      applyRepairCalls === 1,
      1,
      applyRepairCalls,
    ),
    assertBlockerLayer(
      'decision_semantics',
      'post_apply_validate_ran',
      validateCalls >= 1,
      '>=1',
      validateCalls,
    ),
    assertBlockerLayer(
      'policy',
      'not_fake_applied_executed',
      !illegal,
      false,
      illegal,
      'Must not expose EXECUTED/APPLIED when route recalc failed',
    ),
  ];
}

export function assertPartialApplyPathA(input: {
  response: CreateDecisionResponse;
  records: DecisionRecord[];
  tripVersionBefore: string;
}): BlockerAssertionResult[] {
  const { response, records, tripVersionBefore } = input;

  return [
    assertBlockerLayer(
      'api',
      'record_status_rolled_back',
      response.decision.status === 'ROLLED_BACK',
      'ROLLED_BACK',
      response.decision.status,
    ),
    assertBlockerLayer(
      'api',
      'execution_status_rolled_back',
      response.executionStatus === 'ROLLED_BACK',
      'ROLLED_BACK',
      response.executionStatus,
    ),
    assertBlockerLayer(
      'itinerary_state',
      'trip_version_not_advanced',
      !response.tripVersionAfter || response.tripVersionAfter === tripVersionBefore,
      tripVersionBefore,
      response.tripVersionAfter ?? 'undefined',
    ),
    assertBlockerLayer(
      'decision_semantics',
      'no_executed_record',
      records.every((r) => r.status !== 'EXECUTED'),
      'no EXECUTED',
      records.map((r) => r.status),
    ),
  ];
}
