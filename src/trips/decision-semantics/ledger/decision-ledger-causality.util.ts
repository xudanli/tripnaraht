/**
 * V1.6.1 — Link user DecisionRecord ↔ Ledger nodes via caused_by edges.
 */

import type { DecisionLedgerSnapshot, LedgerEdgeV1 } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import type { DecisionLedgerRefs } from '../types/decision-semantics.types';

export const DECISION_LEDGER_ANCHOR_PREFIX = 'decision:';

export function decisionLedgerAnchorId(decisionId: string): string {
  return `${DECISION_LEDGER_ANCHOR_PREFIX}${decisionId}`;
}

export function parseDecisionIdFromLedgerAnchor(anchorId: string): string | undefined {
  if (!anchorId.startsWith(DECISION_LEDGER_ANCHOR_PREFIX)) return undefined;
  return anchorId.slice(DECISION_LEDGER_ANCHOR_PREFIX.length);
}

export function nodeIdsForCausalityAnnotation(refs: DecisionLedgerRefs): string[] {
  return [
    ...new Set([
      ...refs.sourceNodeIds,
      ...(refs.invalidatedNodeIds ?? []),
      ...(refs.recomputedNodeIds ?? []),
    ]),
  ];
}

export function buildCausedByEdges(decisionId: string, nodeIds: string[]): LedgerEdgeV1[] {
  const from = decisionLedgerAnchorId(decisionId);
  return nodeIds.map((nodeId) => ({
    from,
    to: nodeId,
    kind: 'caused_by' as const,
  }));
}

function edgeKey(e: LedgerEdgeV1): string {
  return `${e.kind}:${e.from}:${e.to}`;
}

export function mergeCausedByEdges(
  ledger: DecisionLedgerSnapshot,
  incoming: LedgerEdgeV1[],
): DecisionLedgerSnapshot {
  if (!incoming.length) return ledger;

  const existing = new Set(ledger.edges.map(edgeKey));
  const mergedEdges = [...ledger.edges];
  for (const e of incoming) {
    const key = edgeKey(e);
    if (existing.has(key)) continue;
    existing.add(key);
    mergedEdges.push(e);
  }

  return { ...ledger, edges: mergedEdges };
}

export function resolveDecisionIdFromLedgerNode(
  ledger: DecisionLedgerSnapshot,
  nodeId: string,
): string | undefined {
  for (const edge of ledger.edges) {
    if (edge.kind !== 'caused_by' || edge.to !== nodeId) continue;
    const decisionId = parseDecisionIdFromLedgerAnchor(edge.from);
    if (decisionId) return decisionId;
  }
  return undefined;
}

export function buildLedgerNodeToDecisionIndex(
  ledger: DecisionLedgerSnapshot,
): Record<string, string> {
  const index: Record<string, string> = {};
  for (const edge of ledger.edges) {
    if (edge.kind !== 'caused_by') continue;
    const decisionId = parseDecisionIdFromLedgerAnchor(edge.from);
    if (decisionId) {
      index[edge.to] = decisionId;
    }
  }
  return index;
}

export function annotateLedgerRefsWithCausality(
  refs: DecisionLedgerRefs,
  annotatedNodeIds: string[],
): DecisionLedgerRefs {
  return {
    ...refs,
    causedByAnnotatedNodeIds: annotatedNodeIds.length ? annotatedNodeIds : undefined,
  };
}
