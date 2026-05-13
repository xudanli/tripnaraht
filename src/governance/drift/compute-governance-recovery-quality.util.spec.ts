import { computeGovernanceRecoveryQualityScore } from './compute-governance-recovery-quality.util';
import { buildGovernanceRuntimeTransitionLedgerEvent } from '../runtime-state-machine/governance-runtime-transition-ledger.util';

describe('computeGovernanceRecoveryQualityScore', () => {
  it('penalizes multiple recovery cycles', () => {
    const tripId = 't';
    const t1 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r',
      fromState: 'REPLANNING',
      toState: 'RECOVERING',
      event: 'replanning_succeeded',
      transitionReasonCodes: [],
    });
    t1.timestamp = 10;
    const t2 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r',
      fromState: 'RECOVERING',
      toState: 'NORMAL',
      event: 'execution_resumed',
      transitionReasonCodes: [],
    });
    t2.timestamp = 20;
    const t3 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r',
      fromState: 'REPLANNING',
      toState: 'RECOVERING',
      event: 'replanning_succeeded',
      transitionReasonCodes: [],
    });
    t3.timestamp = 100;
    const t4 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r',
      fromState: 'RECOVERING',
      toState: 'NORMAL',
      event: 'execution_resumed',
      transitionReasonCodes: [],
    });
    t4.timestamp = 130;
    const q = computeGovernanceRecoveryQualityScore([t1, t2, t3, t4], tripId);
    expect(q.recoveryCycleCount).toBe(2);
    expect(q.score).toBeLessThan(1);
  });
});
