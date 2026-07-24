import {
  resolveActionsCommitCanaryGate,
  UWC_ACTIONS_CANARY_CONTRACT_COMPLETE,
} from './actions-commit-canary.config';
import { admitActionsCommitCanaryRequest } from './actions-commit-canary.admit';
import {
  canaryBucket,
  decideActionsCommitCanaryRoute,
  decideCanaryLegacyFallback,
} from './actions-commit-canary.router';
import { executeActionsCommitAuthoritativeCanary } from './actions-commit-canary.executor';
import {
  advanceCutoverAfterActionsCanaryPass,
  UWC_CORRIDOR_CUTOVER_STATUS,
  assertNoAutoUnlockAll,
} from './corridor-cutover.gate';
import {
  UWC_1C_OCC_UNLOCKED,
  UWC_AUTHORITATIVE_DUAL_GATE_STATUS,
} from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';

describe('UWC-CANARY-01 ACTIONS_COMMIT', () => {
  const enabledEnv = {
    UWC_ACTIONS_CANARY_AUTHORIZED: '1',
    UWC_ACTIONS_CANARY_KILL_SWITCH: '0',
    UWC_ACTIONS_CANARY_PERCENT: '100',
    UWC_ACTIONS_CANARY_ACTION_ALLOWLIST: 'execution.remind',
  } as NodeJS.ProcessEnv;

  it('gate is independent of global AUTHORITATIVE and compensation exec', () => {
    expect(UWC_ACTIONS_CANARY_CONTRACT_COMPLETE).toBe(true);
    expect(UWC_1C_OCC_UNLOCKED).toBe(false);
    expect(UWC_AUTHORITATIVE_DUAL_GATE_STATUS.unlocked).toBe(false);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(false);
  });

  it('kill switch disables canary even when authorized', () => {
    const g = resolveActionsCommitCanaryGate({
      ...enabledEnv,
      UWC_ACTIONS_CANARY_KILL_SWITCH: '1',
    });
    expect(g.enabled).toBe(false);
  });

  it('admits only allowlisted NO_EFFECTIVE_SIDE_EFFECT actions', () => {
    const ok = admitActionsCommitCanaryRequest(
      { actionNames: ['execution.remind'], actionTypes: ['NOTIFY'], sideEffectHandlerIds: [] },
      enabledEnv,
    );
    expect(ok.admitted).toBe(true);

    const bad = admitActionsCommitCanaryRequest(
      {
        actionNames: ['trip.apply_user_edit'],
        actionTypes: ['ADJUST'],
        sideEffectHandlerIds: ['side_effect.financial_hold.book_flight_v1'],
      },
      enabledEnv,
    );
    expect(bad.admitted).toBe(false);
  });

  it('deterministic percent routing: same key → same bucket', () => {
    expect(canaryBucket('idem-a')).toBe(canaryBucket('idem-a'));
    const selected = decideActionsCommitCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        actionNames: ['execution.remind'],
        actionTypes: ['NOTIFY'],
        sideEffectHandlerIds: [],
      },
      env: enabledEnv,
    });
    expect(selected.selectedForCanary).toBe(true);
    expect(selected.mode).toBe('AUTHORITATIVE_CANARY');

    const miss = decideActionsCommitCanaryRoute({
      routingKey: 'force-select-key',
      admission: {
        actionNames: ['execution.remind'],
        actionTypes: ['NOTIFY'],
        sideEffectHandlerIds: [],
      },
      env: { ...enabledEnv, UWC_ACTIONS_CANARY_PERCENT: '0' },
    });
    expect(miss.selectedForCanary).toBe(false);
    expect(miss.mode).toBe('LEGACY_WITH_SHADOW');
  });

  it('canary executor applies without dual execution / writes', () => {
    const result = executeActionsCommitAuthoritativeCanary({
      tripId: 't1',
      requestId: 'r1',
      idempotencyKey: 'idem-1',
      contextSignature: 'sig',
      expectedResourceVersion: 1,
      observedResourceVersion: 1,
    });
    expect(result.outcome).toBe('APPLIED');
    expect(result.writeTargetsTouched).toEqual([]);
    expect(result.corridorResult?.dualExecution).toBe(false);
    expect(result.corridorResult?.writesPerformed).toBe(false);
  });

  it('forbids legacy fallback on conflict/reject/verify', () => {
    expect(
      decideCanaryLegacyFallback({ uwcOutcome: 'CONFLICT' }).allowLegacyFallback,
    ).toBe(false);
    expect(
      decideCanaryLegacyFallback({ uwcOutcome: 'REJECTED' }).allowLegacyFallback,
    ).toBe(false);
    expect(
      decideCanaryLegacyFallback({
        uwcOutcome: 'VERIFICATION_REQUIRED',
      }).allowLegacyFallback,
    ).toBe(false);
    expect(
      decideCanaryLegacyFallback({
        technicalExceptionBeforeSideEffects: true,
        sideEffectsStarted: false,
      }).allowLegacyFallback,
    ).toBe(true);
    expect(
      decideCanaryLegacyFallback({
        technicalExceptionBeforeSideEffects: true,
        sideEffectsStarted: true,
      }).allowLegacyFallback,
    ).toBe(false);
  });

  it('after ACTIONS canary pass, only ITINERARY advances to next review', () => {
    // isolate mutable status
    const prevA = UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT;
    const prevI = UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST;
    const prevU = UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE;
    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = 'CANARY_IN_PROGRESS';
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = 'BLOCKED_UNTIL_PRIOR_CORRIDOR';

    advanceCutoverAfterActionsCanaryPass();
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT).toBe('CANARY_APPROVED');
    expect(UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST).toBe(
      'PENDING_CANARY_REVIEW',
    );
    expect(UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE).toBe(
      'BLOCKED_UNTIL_PRIOR_CORRIDOR',
    );
    expect(() => assertNoAutoUnlockAll()).not.toThrow();

    UWC_CORRIDOR_CUTOVER_STATUS.ACTIONS_COMMIT = prevA;
    UWC_CORRIDOR_CUTOVER_STATUS.ITINERARY_ADJUST = prevI;
    UWC_CORRIDOR_CUTOVER_STATUS.UNIFIED_EXECUTE = prevU;
  });
});
