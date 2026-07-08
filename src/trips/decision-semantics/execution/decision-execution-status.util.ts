/**
 * P1 — map DecisionRecord + apply outcome → user-visible execution status.
 */

import type {
  DecisionApplyResultSummary,
  DecisionExecutionStatus,
  DecisionRecord,
  DecisionRecordStatus,
} from '../types/decision-semantics.types';

export function resolveDecisionExecutionStatus(input: {
  record: Pick<
    DecisionRecord,
    'status' | 'validationStatus' | 'tripVersionAfter' | 'lastOutcomeValidation'
  >;
  applyResult?: DecisionApplyResultSummary;
}): DecisionExecutionStatus {
  const { record, applyResult } = input;
  const applyStatus = applyResult?.status?.toLowerCase();

  if (record.status === 'ROLLED_BACK') return 'ROLLED_BACK';
  if (record.status === 'PARTIALLY_APPLIED') return 'PARTIALLY_APPLIED';
  if (record.status === 'REJECTED') return 'FAILED';

  if (applyStatus === 'deferred') return 'RECORDED';
  if (applyStatus === 'failed' || applyStatus === 'error') return 'FAILED';

  if (record.status === 'PROPOSED') return 'RECORDED';

  if (record.status === 'APPROVED') {
    if (applyResult && applyStatus !== 'applied' && applyStatus !== 'redirect') {
      return 'RECORDED';
    }
    return 'RECORDED';
  }

  if (record.status === 'EXECUTED') {
    if (record.validationStatus === 'CONFIRMED') return 'RESOLVED';
    if (record.validationStatus === 'PARTIALLY_VALIDATED') return 'PARTIALLY_RESOLVED';
    if (record.validationStatus === 'REFUTED') return 'PARTIALLY_RESOLVED';
    if (record.lastOutcomeValidation?.failureReasons?.includes('DATA_STALE')) {
      return 'RECOMPUTING';
    }
    if (record.tripVersionAfter) return 'APPLIED';
    return 'APPLYING';
  }

  return mapRecordStatusFallback(record.status);
}

function mapRecordStatusFallback(status: DecisionRecordStatus): DecisionExecutionStatus {
  switch (status) {
    case 'EXECUTED':
      return 'APPLIED';
    case 'PARTIALLY_APPLIED':
      return 'PARTIALLY_APPLIED';
    case 'APPROVED':
    case 'PROPOSED':
      return 'RECORDED';
    case 'SUPERSEDED':
      return 'RESOLVED';
    default:
      return 'RECORDED';
  }
}

export function toDecisionExecutionSnapshot(
  record: DecisionRecord,
  executionStatus: DecisionExecutionStatus,
) {
  const needsRepair =
    record.needsRepair === true || record.postApplyCoherence?.needsRepair === true;
  return {
    decisionId: record.id,
    problemId: record.problemId,
    selectedOptionId: record.selectedOptionId,
    status: executionStatus,
    executionStatus,
    recordStatus: record.status,
    needsRepair: needsRepair || undefined,
    decidedAt: record.decidedAt,
    tripVersionBefore: record.tripVersionBefore,
    tripVersionAfter: record.tripVersionAfter,
  };
}
