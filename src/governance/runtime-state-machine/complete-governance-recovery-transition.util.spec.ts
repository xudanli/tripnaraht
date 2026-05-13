import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { buildGovernanceRuntimeTransitionLedgerEvent } from './governance-runtime-transition-ledger.util';
import { completeGovernanceRecoveryTransition } from './complete-governance-recovery-transition.util';
import type { GovernanceRecoveryValidation } from './governance-recovery-validation.types';
import type { RuntimeBranchDirective } from '../activation/runtime/runtime-branch-directive.types';

describe('completeGovernanceRecoveryTransition (RCC)', () => {
  const directive: RuntimeBranchDirective = {
    branchType: 'replanning',
    sourceActivationIds: ['test'],
    replanningIntent: {
      trigger: 'execution_block',
      requiredActions: [],
      preservedConstraints: [],
      forbiddenStrategies: [],
      replanningScope: 'trip',
    },
  };

  function mkStore(timeline: GovernanceLedgerEvent[]): GovernanceLedgerStoreService {
    const appended: GovernanceLedgerEvent[] = [];
    return {
      replayGovernanceTimeline: jest.fn(async () => [...timeline, ...appended]),
      appendEvent: jest.fn((e: GovernanceLedgerEvent) => {
        appended.push(e);
      }),
    } as unknown as GovernanceLedgerStoreService;
  }

  it('appends resolution, execution_resumed transition, and branch outcome when RVL clears', async () => {
    const tripId = 't1';
    const blk: GovernanceLedgerEvent = {
      id: 'blk',
      tripId,
      timestamp: 10,
      eventLevel: 'L1_operational',
      eventType: 'execution_block',
      correlationId: 'c',
      causalityChainId: 'h',
      executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v',
      affectedSubsystems: [],
    };
    const tr1 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r0',
      fromState: 'NORMAL',
      toState: 'REPLANNING',
      event: 'replanning_started',
      transitionReasonCodes: [],
    });
    tr1.timestamp = 20;
    const tr2 = buildGovernanceRuntimeTransitionLedgerEvent({
      tripId,
      requestId: 'r0',
      fromState: 'REPLANNING',
      toState: 'RECOVERING',
      event: 'replanning_succeeded',
      transitionReasonCodes: [],
    });
    tr2.timestamp = 30;
    const timeline = [blk, tr1, tr2];
    const store = mkStore(timeline);
    const validation: GovernanceRecoveryValidation = {
      valid: true,
      remainingRisks: [],
      unresolvedConstraints: [],
      recommendedRuntimeState: 'NORMAL',
    };
    const r = await completeGovernanceRecoveryTransition(store, {
      tripId,
      requestId: 'req-1',
      validation,
      directiveForOutcome: directive,
    });
    expect(r.applied).toBe(true);
    expect(r.resolvedBlockIds).toEqual(['blk']);
    expect(store.appendEvent).toHaveBeenCalled();
    const types = (store.appendEvent as jest.Mock).mock.calls.map((c) => c[0].eventType);
    expect(types).toContain('governance_resolution_event');
    expect(types).toContain('governance_runtime_transition');
    expect(types).toContain('governance_branch_outcome');
  });

  it('skips when not in RECOVERING', async () => {
    const tripId = 't2';
    const timeline: GovernanceLedgerEvent[] = [];
    const store = mkStore(timeline);
    const validation: GovernanceRecoveryValidation = {
      valid: true,
      remainingRisks: [],
      unresolvedConstraints: [],
      recommendedRuntimeState: 'NORMAL',
    };
    const r = await completeGovernanceRecoveryTransition(store, {
      tripId,
      requestId: 'r',
      validation,
      directiveForOutcome: directive,
    });
    expect(r.applied).toBe(false);
    expect(r.skipReason).toBe('grsm.not_recovering');
  });
});
