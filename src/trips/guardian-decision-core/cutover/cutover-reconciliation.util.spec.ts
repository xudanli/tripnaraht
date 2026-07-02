import {
  assertRecordExecutableForAuthorize,
  assertRecordExecutableForExecute,
  CutoverReconciliationBlockedError,
  isActionablePendingRecord,
  isCutoverReconciliationBlocked,
  isEffectiveExecutable,
} from './cutover-reconciliation.util';

describe('cutover-reconciliation.util', () => {
  const base = {
    decisionId: 'dec_test',
    recordStatus: 'AUTHORIZED' as const,
  };

  it('blocks execute on EXPIRED reconciled AUTHORIZED', () => {
    const record = {
      ...base,
      cutoverReconciliation: {
        status: 'EXPIRED',
        reason: 'STALE_AUTHORIZATION_BEFORE_RUNTIME_CUTOVER',
        previousStatus: 'AUTHORIZED',
        executable: false,
      },
    };
    expect(isEffectiveExecutable(record)).toBe(false);
    expect(() => assertRecordExecutableForExecute(record)).toThrow(
      CutoverReconciliationBlockedError,
    );
  });

  it('blocks authorize/execute on INVALID_ORPHANED', () => {
    const record = {
      decisionId: 'dec_orphan',
      recordStatus: 'PROPOSED',
      cutoverReconciliation: {
        status: 'INVALID_ORPHANED',
        reason: 'ORPHANED_AUTHORIZATION_MISSING_DECISION_RUN',
        previousStatus: 'PROPOSED',
        executable: false,
      },
    };
    expect(() => assertRecordExecutableForAuthorize(record)).toThrow(
      CutoverReconciliationBlockedError,
    );
    expect(() => assertRecordExecutableForExecute(record)).toThrow(
      CutoverReconciliationBlockedError,
    );
  });

  it('blocks authorize on CANCELLED_TEST_DATA proposal', () => {
    const record = {
      decisionId: 'dec_prop',
      recordStatus: 'PROPOSED',
      cutoverReconciliation: {
        status: 'CANCELLED_TEST_DATA',
        reason: 'TEST_DATA_CLEANUP_BEFORE_RUNTIME_CUTOVER',
        previousStatus: 'PROPOSED',
        executable: false,
      },
    };
    expect(isActionablePendingRecord(record)).toBe(false);
    expect(() => assertRecordExecutableForAuthorize(record)).toThrow(
      CutoverReconciliationBlockedError,
    );
  });

  it('allows normal AUTHORIZED without reconciliation', () => {
    const record = { ...base };
    expect(isEffectiveExecutable(record)).toBe(true);
    expect(isActionablePendingRecord(record)).toBe(true);
    expect(() => assertRecordExecutableForExecute(record)).not.toThrow();
  });

  it('isCutoverReconciliationBlocked mirrors isEffectiveExecutable', () => {
    const blocked = {
      ...base,
      cutoverReconciliation: {
        status: 'EXPIRED',
        reason: 'x',
        previousStatus: 'AUTHORIZED',
        executable: false,
      },
    };
    expect(isCutoverReconciliationBlocked(blocked)).toBe(true);
  });
});
