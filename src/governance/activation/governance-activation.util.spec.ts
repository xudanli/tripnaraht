import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import { compactGovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import { deriveGovernanceActivationsFromGovernance } from './derive-governance-activations.util';
import { suggestPolicyAdjustmentsFromGovernance } from './policy-recommendation-from-governance.util';

function block(id: string, ts: number, region: string): GovernanceLedgerEvent {
  return {
    id,
    tripId: 't',
    timestamp: ts,
    eventLevel: 'L1_operational',
    eventType: 'execution_block',
    correlationId: 'c',
    causalityChainId: 'h',
    executionDecision: { status: 'halt', reasonCodes: [], enforcedPolicies: {} },
    causedByPolicies: ['vehicle.2wd'],
    policyVersion: 'v',
    affectedSubsystems: [],
    executionContextSummary: { routeRegion: region },
  };
}

describe('policy-recommendation-from-governance', () => {
  it('suggests winter vehicle elevation after repeated winter-north 2WD blocks', () => {
    const events: GovernanceLedgerEvent[] = Array.from({ length: 5 }, (_, i) =>
      block(`b${i}`, 1000 + i, 'North Iceland winter'),
    );
    const sug = suggestPolicyAdjustmentsFromGovernance(events, { minHits: 3 });
    expect(sug).toHaveLength(1);
    expect(sug[0].id).toBe('elevate_winter_vehicle_requirement');
  });
});

describe('deriveGovernanceActivationsFromGovernance', () => {
  it('maps storm + block toward route_invalidated replanning intent', () => {
    const events: GovernanceLedgerEvent[] = [
      {
        id: 'storm',
        tripId: 't',
        timestamp: 500,
        eventLevel: 'L3_world',
        eventType: 'storm_detected',
        correlationId: 'c',
        causalityChainId: 'h',
        executionDecision: { status: 'restricted', reasonCodes: [], enforcedPolicies: {} },
        causedByPolicies: [],
        policyVersion: 'v',
        affectedSubsystems: [],
      },
      block('blk', 600, 'east'),
    ];
    const snap = compactGovernanceSnapshot(events, { tripId: 't' });
    const acts = deriveGovernanceActivationsFromGovernance({ events, snapshot: snap });
    const replan = acts.find((a) => a.activationType === 'trigger_replanning');
    expect(replan?.replanningIntent?.trigger).toBe('route_invalidated');
  });
});
