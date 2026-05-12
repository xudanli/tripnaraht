import type { TripWorldState } from '../decision/world-model';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import { computeMutationDistance } from './compute-mutation-distance';

function baseLedger(over: Partial<EcoIdentityLedgerSnapshot>): EcoIdentityLedgerSnapshot {
  return {
    recordedAt: '2026-01-01T00:00:00.000Z',
    semanticCoreHash: 'core',
    reflectiveLineage: 'line',
    existentialContinuityScore: 1,
    ontologicalIntegrity: 1,
    epistemicUndecidable: false,
    confidenceSaturated: false,
    carryForwardMetaFreeze: false,
    carryForwardRecursiveFreeze: false,
    carryForwardSuggestRollback: false,
    digestFingerprint: 'abc',
    ...over,
  };
}

function minimalState(): TripWorldState {
  return {
    context: {} as TripWorldState['context'],
    candidatesByDate: {},
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
  };
}

describe('computeMutationDistance', () => {
  it('sums ledger field deltas when prev exists', () => {
    const prev = baseLedger({ digestFingerprint: 'a', semanticCoreHash: 's', reflectiveLineage: 'l' });
    const next = baseLedger({ digestFingerprint: 'b', semanticCoreHash: 't', reflectiveLineage: 'm' });
    const state = minimalState();
    const r = computeMutationDistance(prev, next, undefined, state);
    expect(r.driftScore).toBe(3);
    expect(r.contributors.digestFingerprint).toBe(1);
    expect(r.contributors.semanticCore).toBe(1);
    expect(r.contributors.reflectiveLineage).toBe(1);
  });

  it('does not count ledger-only terms without prev ledger', () => {
    const next = baseLedger({});
    const state = minimalState();
    const r = computeMutationDistance(undefined, next, undefined, state);
    expect(r.contributors.digestFingerprint).toBe(0);
    expect(r.driftScore).toBe(0);
  });

  it('counts causal + overlay when snapshot exists', () => {
    const prev = baseLedger({});
    const next = baseLedger({ digestFingerprint: 'x' });
    const state = minimalState();
    state.signals.reflectiveCausalModel = { nodes: [] } as TripWorldState['signals']['reflectiveCausalModel'];
    state.signals.executionOverlayFrames = [];
    state.signals.executionTruthDAG = { nodes: [], edges: [] } as TripWorldState['signals']['executionTruthDAG'];

    const prevSnap = {
      causalModelHash: 'oldhash',
      overlayFrameCount: 1,
      dagNodeCount: 2,
    };

    const r = computeMutationDistance(prev, next, prevSnap, state);
    expect(r.contributors.digestFingerprint).toBe(1);
    expect(r.contributors.causalModel).toBe(1);
    expect(r.contributors.overlay).toBe(1);
    expect(r.driftScore).toBe(3);
  });
});
