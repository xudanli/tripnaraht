import { computeIdentityPathCost } from './compute-identity-path-cost';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

function baseLedger(over: Partial<EcoIdentityLedgerSnapshot> = {}): EcoIdentityLedgerSnapshot {
  return {
    recordedAt: 't0',
    semanticCoreHash: 'sem',
    reflectiveLineage: 'ref',
    existentialContinuityScore: 1,
    ontologicalIntegrity: 1,
    epistemicUndecidable: false,
    confidenceSaturated: false,
    carryForwardMetaFreeze: false,
    carryForwardRecursiveFreeze: false,
    carryForwardSuggestRollback: false,
    digestFingerprint: 'fp0',
    ...over,
  };
}

describe('computeIdentityPathCost', () => {
  it('is deterministic for identical inputs', () => {
    const path = [baseLedger()];
    const a = computeIdentityPathCost({
      acceptedPath: path,
      rejectionEdges: [],
      closureStabilityScore: 0.9,
    });
    const b = computeIdentityPathCost({
      acceptedPath: path,
      rejectionEdges: [],
      closureStabilityScore: 0.9,
    });
    expect(a).toEqual(b);
  });

  it('accumulates mutation energy between consecutive accepted snapshots', () => {
    const prev = baseLedger({ digestFingerprint: 'a' });
    const next = baseLedger({ digestFingerprint: 'b' });
    const r = computeIdentityPathCost({
      acceptedPath: [prev, next],
      closureStabilityScore: 1,
    });
    expect(r.components.mutationEnergy).toBeGreaterThan(0);
    expect(r.components.stabilityDecay).toBe(0);
  });

  it('maps stability to decay and keeps normalizedScore in [0,1]', () => {
    const r = computeIdentityPathCost({
      acceptedPath: [baseLedger()],
      closureStabilityScore: 0.4,
    });
    expect(r.components.stabilityDecay).toBeCloseTo(0.6, 5);
    expect(r.normalizedScore).toBeGreaterThanOrEqual(0);
    expect(r.normalizedScore).toBeLessThanOrEqual(1);
  });

  it('caps rejection pressure and uses lineage ids when present', () => {
    const l1 = baseLedger({
      digestFingerprint: 'f1',
      ecoIdentityLineage: { ledgerId: 'L1', branchId: 'main', depth: 0 },
    });
    const l2 = baseLedger({
      digestFingerprint: 'f2',
      ecoIdentityLineage: { ledgerId: 'L2', parentLedgerId: 'L1', branchId: 'main', depth: 1 },
    });
    const r = computeIdentityPathCost({
      acceptedPath: [l1, l2],
      rejectionEdges: [
        {
          fromLedgerId: 'L1',
          attemptedLedgerHash: 'x',
          mutationDistance: 1,
          reason: 'test',
          at: 't',
        },
        {
          fromLedgerId: 'unknown',
          attemptedLedgerHash: 'y',
          mutationDistance: 1,
          reason: 'test',
          at: 't',
        },
      ],
      closureStabilityScore: 1,
    });
    expect(r.components.rejectionPressure).toBeLessThanOrEqual(1);
    expect(r.components.rejectionPressure).toBeGreaterThan(0);
  });
});
