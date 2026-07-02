/**
 * Runtime effective-executable gate — must match ops probe semantics.
 *
 * effectiveExecutable =
 *   recordStatus allows action
 *   && cutoverReconciliation?.executable !== false
 *   && status not in blocked reconciliation set
 */

import { BadRequestException } from '@nestjs/common';
import {
  CUTOVER_RECONCILIATION_BLOCKED_STATUSES,
  type Rfc001RecordWithCutoverReconciliation,
} from './cutover-reconciliation.types';

export class CutoverReconciliationBlockedError extends BadRequestException {
  constructor(input: {
    decisionId: string;
    action: 'authorize' | 'execute';
    reconciliationStatus: string;
    reason: string;
    recordStatus: string;
  }) {
    super({
      guardCode: 'CUTOVER_RECONCILIATION_BLOCKED',
      message: `Decision ${input.decisionId} blocked by cutover reconciliation (${input.reconciliationStatus})`,
      ...input,
    });
  }
}

export function isCutoverReconciliationBlocked(
  record: Rfc001RecordWithCutoverReconciliation,
): boolean {
  return !isEffectiveExecutable(record);
}

export function isEffectiveExecutable(
  record: Rfc001RecordWithCutoverReconciliation,
): boolean {
  const recon = record.cutoverReconciliation;
  if (recon?.executable === false) return false;
  const status = recon?.status;
  if (
    status &&
    (CUTOVER_RECONCILIATION_BLOCKED_STATUSES as readonly string[]).includes(status)
  ) {
    return false;
  }
  return true;
}

export function assertRecordExecutableForAuthorize(
  record: Rfc001RecordWithCutoverReconciliation,
): void {
  if (isEffectiveExecutable(record)) return;
  const recon = record.cutoverReconciliation;
  throw new CutoverReconciliationBlockedError({
    decisionId: record.decisionId,
    action: 'authorize',
    reconciliationStatus: recon?.status ?? 'BLOCKED',
    reason:
      recon?.reason ??
      (recon?.status === 'CANCELLED_TEST_DATA'
        ? 'REEVALUATION_REQUIRED_AFTER_RUNTIME_CUTOVER'
        : 'CUT_OVER_RECONCILIATION'),
    recordStatus: record.recordStatus,
  });
}

export function assertRecordExecutableForExecute(
  record: Rfc001RecordWithCutoverReconciliation,
): void {
  if (isEffectiveExecutable(record)) return;
  const recon = record.cutoverReconciliation;
  throw new CutoverReconciliationBlockedError({
    decisionId: record.decisionId,
    action: 'execute',
    reconciliationStatus: recon?.status ?? 'BLOCKED',
    reason: recon?.reason ?? 'CUT_OVER_RECONCILIATION',
    recordStatus: record.recordStatus,
  });
}

/** Decision Center / pending queries — exclude reconciled from actionable set. */
export function isActionablePendingRecord(
  record: Rfc001RecordWithCutoverReconciliation,
): boolean {
  if (!isEffectiveExecutable(record)) return false;
  if (record.recordStatus === 'PROPOSED') return true;
  if (record.recordStatus === 'AUTHORIZED' && !record.effectivePlanVersionId) return true;
  return false;
}
