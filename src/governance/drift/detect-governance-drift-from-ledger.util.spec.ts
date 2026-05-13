import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { buildGovernanceResolutionLedgerEvent } from '../runtime-state-machine/governance-resolution-ledger.util';
import { detectGovernanceDriftFromLedger } from './detect-governance-drift-from-ledger.util';

describe('detectGovernanceDriftFromLedger', () => {
  it('emits recurring_block when the same block id is resolved more than once', () => {
    const r1 = buildGovernanceResolutionLedgerEvent({
      tripId: 't',
      requestId: 'a',
      resolvedLedgerEventId: 'blk1',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r1.timestamp = 100;
    const r2 = buildGovernanceResolutionLedgerEvent({
      tripId: 't',
      requestId: 'b',
      resolvedLedgerEventId: 'blk1',
      resolutionKind: 'recovery_closure',
      reasonCodes: [],
    });
    r2.timestamp = 200;
    const signals = detectGovernanceDriftFromLedger([r1, r2], 't', { runtimeState: 'NORMAL' });
    expect(signals.some((s) => s.type === 'recurring_block')).toBe(true);
  });

  it('emits world_regression when NORMAL and multiple recent L3 events exist', () => {
    const w1: GovernanceLedgerEvent = {
      id: 'w1',
      tripId: 't',
      timestamp: 1,
      eventLevel: 'L3_world',
      eventType: 'weather_escalated',
      correlationId: 'c',
      causalityChainId: 'h',
      executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v',
      affectedSubsystems: [],
    };
    const w2: GovernanceLedgerEvent = { ...w1, id: 'w2', timestamp: 2, eventType: 'storm_detected' };
    const signals = detectGovernanceDriftFromLedger([w1, w2], 't', { runtimeState: 'NORMAL', worldPressure: 0.7 });
    expect(signals.some((s) => s.type === 'world_regression')).toBe(true);
  });
});
