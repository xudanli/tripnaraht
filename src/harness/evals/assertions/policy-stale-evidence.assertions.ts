import type { CreateDecisionResponse } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';

export function assertStaleEvidenceBlocksAutoRepair(input: {
  response: CreateDecisionResponse;
  applyRepairCalls: number;
}): BlockerAssertionResult[] {
  const { response, applyRepairCalls } = input;

  return [
    assertBlockerLayer(
      'policy',
      'data_stale_reason_present',
      response.evidenceFreshnessBlock?.reasonCode === 'DATA_STALE' ||
        response.applyResult?.blockerId === 'DATA_STALE' ||
        response.decision.reasons.some((r) => r.text.includes('DATA_STALE') || r.code === 'DATA_STALE'),
      'DATA_STALE',
      response.evidenceFreshnessBlock?.reasonCode ?? response.applyResult?.blockerId,
    ),
    assertBlockerLayer(
      'policy',
      'requires_evidence_refresh',
      response.evidenceFreshnessBlock?.requiresEvidenceRefresh === true ||
        response.applyResult?.status === 'blocked',
      true,
      response.evidenceFreshnessBlock?.requiresEvidenceRefresh,
    ),
    assertBlockerLayer(
      'decision_semantics',
      'apply_repair_not_called',
      applyRepairCalls === 0,
      0,
      applyRepairCalls,
      'Stale evidence must not trigger applyRepair',
    ),
    assertBlockerLayer(
      'api',
      'not_executed_or_applied',
      response.decision.status !== 'EXECUTED' && response.executionStatus !== 'APPLIED',
      'not EXECUTED/APPLIED',
      `${response.decision.status}/${response.executionStatus}`,
    ),
    assertBlockerLayer(
      'itinerary_state',
      'no_trip_version_bump_from_repair',
      !response.tripVersionAfter,
      undefined,
      response.tripVersionAfter,
    ),
  ];
}
