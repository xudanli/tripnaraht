import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import type {
  EcoIdentityLineageGraphEdge,
  IdentityRejectionEdge,
} from './eco-identity-lineage.types';

export interface EcoIdentityLineageGraphView {
  nodes: EcoIdentityLedgerSnapshot[];
  edges: EcoIdentityLineageGraphEdge[];
}

const REJECT_VERTEX_PREFIX = '__rejected__:' as const;

/**
 * Read-only observational graph: accepted parent→child edges from ledger pointers + rejected edges from P-E1 guard.
 * Does not merge branches or mutate runtime state.
 */
export function buildEcoIdentityLineageGraph(input: {
  acceptedLedgers: EcoIdentityLedgerSnapshot[];
  rejectionEdges: IdentityRejectionEdge[];
}): EcoIdentityLineageGraphView {
  const nodes = dedupeLedgersByLedgerId(input.acceptedLedgers);
  const edges: EcoIdentityLineageGraphEdge[] = [];

  for (const ledger of nodes) {
    const lin = ledger.ecoIdentityLineage;
    if (!lin) continue;
    if (lin.parentLedgerId) {
      edges.push({
        from: lin.parentLedgerId,
        to: lin.ledgerId,
        type: 'accepted',
      });
    }
  }

  for (const r of input.rejectionEdges) {
    edges.push({
      from: r.fromLedgerId,
      to: `${REJECT_VERTEX_PREFIX}${r.attemptedLedgerHash.slice(0, 32)}`,
      type: 'rejected',
      attemptedLedgerHash: r.attemptedLedgerHash,
      mutationDistance: r.mutationDistance,
      reason: r.reason,
    });
  }

  return { nodes, edges };
}

function dedupeLedgersByLedgerId(ledgers: EcoIdentityLedgerSnapshot[]): EcoIdentityLedgerSnapshot[] {
  const seen = new Set<string>();
  const out: EcoIdentityLedgerSnapshot[] = [];
  for (const L of ledgers) {
    const id = L.ecoIdentityLineage?.ledgerId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(L);
  }
  return out;
}
