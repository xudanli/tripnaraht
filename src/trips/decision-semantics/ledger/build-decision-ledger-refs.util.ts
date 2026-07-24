/**
 * Pure helpers: infer ledger node refs from DecisionProblem + ledger snapshots.
 */

import type { LedgerActionType, DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import type {
  ConstraintDomain,
  DecisionLedgerRefs,
  DecisionProblemDetail,
} from '../types/decision-semantics.types';

const DOMAIN_TO_ACTION: Partial<Record<ConstraintDomain, LedgerActionType[]>> = {
  ROUTE: ['ROUTE_DIRECTION', 'TRANSPORT', 'LOGISTICS'],
  TIME: ['LOGISTICS', 'TRANSPORT'],
  SAFETY: ['ROUTE_DIRECTION', 'WORLD'],
  ACCESS: ['POI', 'LOGISTICS'],
  BOOKING: ['ACCOMMODATION', 'LOGISTICS'],
  WEATHER: ['WORLD', 'ROUTE_DIRECTION'],
  BUDGET: ['ACCOMMODATION', 'TRANSPORT'],
};

export function domainsToLedgerActionTypes(domains: Iterable<ConstraintDomain>): Set<LedgerActionType> {
  const out = new Set<LedgerActionType>();
  for (const d of domains) {
    for (const a of DOMAIN_TO_ACTION[d] ?? []) {
      out.add(a);
    }
  }
  return out;
}

export function inferSourceNodeIds(
  ledger: DecisionLedgerSnapshot,
  problem: Pick<DecisionProblemDetail, 'assertions' | 'affectedScope'>,
): string[] {
  const domains = problem.assertions.map((a) => a.domain);
  const actionTypes = domainsToLedgerActionTypes(domains);

  const matched = ledger.nodes
    .filter((n) => n.status !== 'INVALIDATED' && actionTypes.has(n.actionType))
    .map((n) => n.nodeId);

  if (matched.length) {
    return [...new Set(matched)];
  }

  return ledger.nodes.filter((n) => n.status === 'STABLE').map((n) => n.nodeId);
}

export function diffLedgerNodeChanges(
  before: DecisionLedgerSnapshot,
  after: DecisionLedgerSnapshot,
  decidedAtMs: number,
): Pick<DecisionLedgerRefs, 'invalidatedNodeIds' | 'recomputedNodeIds'> {
  const beforeById = new Map(before.nodes.map((n) => [n.nodeId, n]));
  const invalidatedNodeIds: string[] = [];

  for (const n of after.nodes) {
    const prev = beforeById.get(n.nodeId);
    if (prev && prev.status !== 'INVALIDATED' && n.status === 'INVALIDATED') {
      invalidatedNodeIds.push(n.nodeId);
    }
  }

  const beforeIds = new Set(before.nodes.map((n) => n.nodeId));
  const recomputedNodeIds = after.nodes
    .filter((n) => !beforeIds.has(n.nodeId) && n.createdAt >= decidedAtMs)
    .map((n) => n.nodeId);

  return {
    invalidatedNodeIds: invalidatedNodeIds.length ? invalidatedNodeIds : undefined,
    recomputedNodeIds: recomputedNodeIds.length ? recomputedNodeIds : undefined,
  };
}

export function buildDecisionLedgerRefs(input: {
  decisionId: string;
  problem: DecisionProblemDetail;
  ledgerBefore: DecisionLedgerSnapshot;
  ledgerAfter: DecisionLedgerSnapshot;
  decidedAt: string;
  planInvalidatedNodeIds?: string[];
  ledgerSnapshotVersion?: number;
}): DecisionLedgerRefs {
  const decidedAtMs = Date.parse(input.decidedAt);
  const diff = diffLedgerNodeChanges(input.ledgerBefore, input.ledgerAfter, decidedAtMs);
  const invalidatedNodeIds = [
    ...new Set([...(diff.invalidatedNodeIds ?? []), ...(input.planInvalidatedNodeIds ?? [])]),
  ];

  return {
    sourceNodeIds: inferSourceNodeIds(input.ledgerBefore, input.problem),
    invalidatedNodeIds: invalidatedNodeIds.length ? invalidatedNodeIds : undefined,
    recomputedNodeIds: diff.recomputedNodeIds,
    ledgerRunId: `lr_${input.decisionId}`,
    ledgerSnapshotVersion: input.ledgerSnapshotVersion,
  };
}
