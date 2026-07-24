import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import {
  buildDecisionLedgerRefs,
  diffLedgerNodeChanges,
  inferSourceNodeIds,
} from './build-decision-ledger-refs.util';
import { detectLedgerStaleAfterDecision } from './detect-ledger-stale.util';
import type { DecisionProblemDetail } from '../types/decision-semantics.types';

function makeLedger(nodeIds: string[], status: 'STABLE' | 'INVALIDATED' = 'STABLE'): DecisionLedgerSnapshot {
  return {
    revision: 'v1',
    nodes: nodeIds.map((nodeId, i) => ({
      nodeId,
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'ROUTE_DIRECTION',
      inputSignatures: {
        budgetAnchor: 'b',
        preferenceAnchor: 'p',
        worldAnchor: 'w',
      },
      outputRef: { kind: 'route', payloadDigest: `d${i}` },
      status,
      createdAt: 1_700_000_000_000 + i,
    })),
    edges: [],
    anchors: {
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      world: 'w',
      worldLayered: { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} },
    },
  };
}

const problem: DecisionProblemDetail = {
  id: 'dp_1',
  tripId: 'trip1',
  type: 'INFEASIBILITY',
  title: 'Route blocked',
  description: 'F-road closed',
  detectedBy: 'GATE',
  detectedAt: '2026-06-30T08:00:00Z',
  tripVersion: '1',
  affectedScope: [],
  status: 'OPEN',
  sourceRefs: [],
  assertionIds: ['a1'],
  assertions: [
    {
      id: 'a1',
      sourceSystem: 'GATE',
      sourceRefId: 'g1',
      nature: 'HARD_CONSTRAINT',
      domain: 'ROUTE',
      enforcement: 'BLOCK',
      overridable: false,
      condition: 'F-road closed',
      conclusion: 'Cannot pass',
      proofs: [],
    },
  ],
};

describe('build-decision-ledger-refs', () => {
  it('infers source nodes from problem domain', () => {
    const ledger = makeLedger(['route_a', 'poi_b']);
    ledger.nodes[1].actionType = 'POI';
    const ids = inferSourceNodeIds(ledger, problem);
    expect(ids).toEqual(['route_a']);
  });

  it('captures invalidation and recompute diff', () => {
    const before = makeLedger(['n1', 'n2']);
    const after = makeLedger(['n1', 'n2', 'n3']);
    after.nodes[0].status = 'INVALIDATED';
    after.nodes[2].createdAt = Date.parse('2026-06-30T10:05:00Z');

    const diff = diffLedgerNodeChanges(before, after, Date.parse('2026-06-30T10:00:00Z'));
    expect(diff.invalidatedNodeIds).toEqual(['n1']);
    expect(diff.recomputedNodeIds).toEqual(['n3']);
  });

  it('builds ledger refs with ledgerRunId', () => {
    const before = makeLedger(['n1']);
    const after = makeLedger(['n1', 'n2']);
    after.nodes[1].createdAt = Date.parse('2026-06-30T10:05:00Z');

    const refs = buildDecisionLedgerRefs({
      decisionId: 'dec_abc',
      problem,
      ledgerBefore: before,
      ledgerAfter: after,
      decidedAt: '2026-06-30T10:00:00Z',
      planInvalidatedNodeIds: ['n1'],
      ledgerSnapshotVersion: 3,
    });

    expect(refs.ledgerRunId).toBe('lr_dec_abc');
    expect(refs.sourceNodeIds).toEqual(['n1']);
    expect(refs.recomputedNodeIds).toEqual(['n2']);
    expect(refs.ledgerSnapshotVersion).toBe(3);
  });
});

describe('detect-ledger-stale', () => {
  const baseRecord = {
    id: 'dec_1',
    tripId: 'trip1',
    problemId: 'dp_1',
    selectedOptionId: 'opt_1',
    rejectedOptionIds: [],
    decidedBy: [{ role: 'TRIP_OWNER' as const }],
    authoritySnapshot: {
      decisionDomain: 'ROUTE' as const,
      proposer: 'SYSTEM' as const,
      requiredApprover: 'TRIP_OWNER' as const,
      executionMode: 'EXPLICIT_CONFIRMATION' as const,
      overridable: true,
    },
    reasons: [],
    decidedAt: '2026-06-30T10:00:00Z',
    tripVersionBefore: '1',
    status: 'EXECUTED' as const,
    validationStatus: 'PENDING' as const,
    ledgerRefs: {
      sourceNodeIds: ['n1'],
      invalidatedNodeIds: ['n1'],
      recomputedNodeIds: ['n2'],
      ledgerRunId: 'lr_dec_1',
      ledgerSnapshotVersion: 2,
    },
  };

  it('detects unrecorded recompute nodes', () => {
    const ledger = makeLedger(['n1', 'n2', 'n3']);
    ledger.nodes[2].createdAt = Date.parse('2026-06-30T11:00:00Z');
    expect(detectLedgerStaleAfterDecision(baseRecord, ledger, 2)).toBe(true);
  });

  it('returns false when ledger unchanged since capture', () => {
    const ledger = makeLedger(['n1', 'n2']);
    ledger.nodes[0].status = 'INVALIDATED';
    ledger.nodes[1].createdAt = Date.parse('2026-06-30T10:05:00Z');
    expect(detectLedgerStaleAfterDecision(baseRecord, ledger, 2)).toBe(false);
  });
});
