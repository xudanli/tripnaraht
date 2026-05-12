import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import { buildEcoIdentityLineageGraph } from './build-eco-identity-lineage-graph';
import { ECO_LINEAGE_GENESIS_ID } from './eco-identity-lineage.types';

function ledgerWithLineage(
  id: string,
  parent: string | undefined,
  depth: number,
): EcoIdentityLedgerSnapshot {
  return {
    recordedAt: '2026-01-01T00:00:00.000Z',
    semanticCoreHash: 'c',
    reflectiveLineage: 'l',
    existentialContinuityScore: 1,
    ontologicalIntegrity: 1,
    epistemicUndecidable: false,
    confidenceSaturated: false,
    carryForwardMetaFreeze: false,
    carryForwardRecursiveFreeze: false,
    carryForwardSuggestRollback: false,
    digestFingerprint: 'dig',
    ecoIdentityLineage: {
      ledgerId: id,
      ...(parent !== undefined ? { parentLedgerId: parent } : {}),
      branchId: 'main',
      depth,
    },
  };
}

describe('buildEcoIdentityLineageGraph', () => {
  it('links accepted parent→child and attaches rejected edges', () => {
    const root = ledgerWithLineage('L0', undefined, 0);
    const child = ledgerWithLineage('L1', 'L0', 1);
    const g = buildEcoIdentityLineageGraph({
      acceptedLedgers: [root, child],
      rejectionEdges: [
        {
          fromLedgerId: 'L1',
          attemptedLedgerHash: 'hash_x',
          mutationDistance: 4,
          reason: 'guard',
          at: '2026-01-02T00:00:00.000Z',
        },
      ],
    });
    expect(g.edges.filter(e => e.type === 'accepted')).toEqual([
      { from: 'L0', to: 'L1', type: 'accepted' },
    ]);
    const rej = g.edges.find(e => e.type === 'rejected');
    expect(rej?.from).toBe('L1');
    expect(rej?.attemptedLedgerHash).toBe('hash_x');
    expect(rej?.to.startsWith('__rejected__:')).toBe(true);
  });

  it('uses genesis id only when caller passes it', () => {
    const g = buildEcoIdentityLineageGraph({
      acceptedLedgers: [],
      rejectionEdges: [
        {
          fromLedgerId: ECO_LINEAGE_GENESIS_ID,
          attemptedLedgerHash: 'abc',
          mutationDistance: 9,
          reason: 'first_fail',
          at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(g.edges[0]?.from).toBe(ECO_LINEAGE_GENESIS_ID);
  });
});
