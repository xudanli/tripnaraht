/**
 * Detect whether Decision Ledger changed after a decision was recorded (DATA_STALE).
 */

import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import type { DecisionRecord } from '../types/decision-semantics.types';

export function detectLedgerStaleAfterDecision(
  record: DecisionRecord,
  currentLedger: DecisionLedgerSnapshot | null | undefined,
  currentSnapshotVersion?: number,
): boolean {
  const refs = record.ledgerRefs;
  if (!refs?.ledgerRunId || !currentLedger) {
    return false;
  }

  const decidedAtMs = Date.parse(record.decidedAt);
  const knownRecomputed = new Set(refs.recomputedNodeIds ?? []);
  const knownInvalidated = new Set(refs.invalidatedNodeIds ?? []);
  const sourceNodes = new Set(refs.sourceNodeIds);

  const hasUnrecordedRecompute = currentLedger.nodes.some(
    (n) => n.createdAt >= decidedAtMs && !knownRecomputed.has(n.nodeId),
  );
  if (hasUnrecordedRecompute) {
    return true;
  }

  const hasNewInvalidation = currentLedger.nodes.some(
    (n) =>
      n.status === 'INVALIDATED' &&
      !knownInvalidated.has(n.nodeId) &&
      (sourceNodes.has(n.nodeId) || refs.sourceNodeIds.length === 0),
  );
  if (hasNewInvalidation) {
    return true;
  }

  if (
    refs.ledgerSnapshotVersion != null &&
    currentSnapshotVersion != null &&
    currentSnapshotVersion > refs.ledgerSnapshotVersion
  ) {
    const revisionChanged =
      currentLedger.revision !== undefined &&
      currentLedger.nodes.some((n) => n.createdAt >= decidedAtMs);
    if (revisionChanged || hasNewInvalidation) {
      return true;
    }
  }

  return false;
}
