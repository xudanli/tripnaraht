import { compactGovernanceSnapshot } from './compact-governance-snapshot.util';
import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { buildGovernanceResolutionLedgerEvent } from '../runtime-state-machine/governance-resolution-ledger.util';

describe('compactGovernanceSnapshot', () => {
  it('aggregates dominant policies and world risks', () => {
    const events: GovernanceLedgerEvent[] = [
      {
        id: 'a',
        tripId: 't',
        timestamp: 100,
        eventLevel: 'L3_world',
        eventType: 'road_closed',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: ['p1'],
        policyVersion: 'v',
        affectedSubsystems: [],
      },
    ];
    const s = compactGovernanceSnapshot(events, { tripId: 't' });
    expect(s.dominantPolicies).toContain('p1');
    expect(s.latestWorldRisks).toContain('road_closed');
    expect(s.unresolvedBlocks).toEqual([]);
  });

  it('records unresolved blocks with ledger refs', () => {
    const events: GovernanceLedgerEvent[] = [
      {
        id: 'blk',
        tripId: 't',
        timestamp: 200,
        eventLevel: 'L1_operational',
        eventType: 'execution_block',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: [],
        policyVersion: 'v',
        affectedSubsystems: [],
      },
    ];
    const s = compactGovernanceSnapshot(events, { tripId: 't' });
    expect(s.unresolvedBlocks).toEqual([{ ledgerEventId: 'blk' }]);
    expect(s.runtimeState).toBe('NORMAL');
  });

  it('applies governance_resolution_event to unresolved blocks', () => {
    const blk: GovernanceLedgerEvent = {
      id: 'blk',
      tripId: 't',
      timestamp: 100,
      eventLevel: 'L1_operational',
      eventType: 'execution_block',
      correlationId: 'c',
      causalityChainId: 'h',
      executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
      causedByPolicies: [],
      policyVersion: 'v',
      affectedSubsystems: [],
    };
    const res = buildGovernanceResolutionLedgerEvent({
      tripId: 't',
      requestId: 'req',
      resolvedLedgerEventId: 'blk',
      resolutionKind: 'recovery_closure',
      reasonCodes: ['test'],
    });
    res.timestamp = 200;
    const s = compactGovernanceSnapshot([blk, res], { tripId: 't' });
    expect(s.unresolvedBlocks[0].resolvedAt).toBe(200);
    expect(s.unresolvedBlocks[0].resolutionEventId).toBe(res.id);
  });
});
