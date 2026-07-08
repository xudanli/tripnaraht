import type { CreateDecisionResponse } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { DecisionRecord } from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  assertBlockerLayer,
  type BlockerAssertionResult,
} from '../blockers/blocker-case.schema';

export function isEffectiveDecisionRecord(record: DecisionRecord): boolean {
  return record.recordKind !== 'IDEMPOTENT_REPLAY_AUDIT';
}

export function isReplayAuditRecord(record: DecisionRecord): boolean {
  return record.recordKind === 'IDEMPOTENT_REPLAY_AUDIT';
}

export function countEffectiveDecisions(records: DecisionRecord[]): number {
  return records.filter(isEffectiveDecisionRecord).length;
}

export function countReplayAudits(records: DecisionRecord[]): number {
  return records.filter(isReplayAuditRecord).length;
}

/** API layer — first apply vs idempotent replay */
export function assertDecisionIdempotencyApiLayer(input: {
  first: CreateDecisionResponse;
  second: CreateDecisionResponse;
}): BlockerAssertionResult[] {
  const { first, second } = input;
  return [
    assertBlockerLayer(
      'api',
      'first_execution_status_applied',
      first.executionStatus === 'APPLIED',
      'APPLIED',
      first.executionStatus,
    ),
    assertBlockerLayer(
      'api',
      'second_execution_status_idempotent_replay',
      second.executionStatus === 'IDEMPOTENT_REPLAY',
      'IDEMPOTENT_REPLAY',
      second.executionStatus,
    ),
    assertBlockerLayer(
      'api',
      'second_marks_idempotent_replay',
      second.idempotentReplay === true,
      true,
      second.idempotentReplay,
    ),
    assertBlockerLayer(
      'api',
      'second_points_to_effective_decision',
      second.effectiveDecisionId === first.decision.id,
      first.decision.id,
      second.effectiveDecisionId,
    ),
  ];
}

/** Decision Semantics layer — effective vs audit record counts */
export function assertDecisionIdempotencySemanticsLayer(input: {
  records: DecisionRecord[];
  applyRepairCallCount: number;
  tripVersionResolveCallCount: number;
}): BlockerAssertionResult[] {
  const { records, applyRepairCallCount, tripVersionResolveCallCount } = input;
  return [
    assertBlockerLayer(
      'decision_semantics',
      'effective_decision_count_is_one',
      countEffectiveDecisions(records) === 1,
      1,
      countEffectiveDecisions(records),
    ),
    assertBlockerLayer(
      'decision_semantics',
      'replay_audit_count_is_one',
      countReplayAudits(records) === 1,
      1,
      countReplayAudits(records),
    ),
    assertBlockerLayer(
      'decision_semantics',
      'apply_repair_called_once',
      applyRepairCallCount === 1,
      1,
      applyRepairCallCount,
      'Duplicate apply must not re-invoke feasibility.applyRepair',
    ),
    assertBlockerLayer(
      'decision_semantics',
      'trip_version_resolved_once',
      tripVersionResolveCallCount === 1,
      1,
      tripVersionResolveCallCount,
      'Idempotent replay must not bump trip version again',
    ),
  ];
}
