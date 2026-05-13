import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernanceUnresolvedBlock } from '../snapshot/compact-governance-snapshot.util';

/**
 * Heuristic only: if a later non-halt execution-positive signal appears, mark prior blocks resolved.
 * Callers must treat as advisory until explicit resolution events exist in ledger.
 */
export function applyHeuristicBlockResolutions(
  blocks: GovernanceUnresolvedBlock[],
  eventsSortedDesc: readonly GovernanceLedgerEvent[],
): GovernanceUnresolvedBlock[] {
  const asc = [...eventsSortedDesc].sort((a, b) => a.timestamp - b.timestamp);
  return blocks.map((b) => {
    if (b.resolvedAt != null) return b;
    const blockTs = asc.find((e) => e.id === b.ledgerEventId)?.timestamp;
    if (blockTs == null) return b;
    const clearer = asc.find(
      (e) =>
        e.timestamp > blockTs &&
        e.executionDecision.status === 'allow' &&
        e.eventType !== 'execution_block',
    );
    if (!clearer) return b;
    return {
      ...b,
      resolutionEventId: clearer.id,
      resolvedAt: clearer.timestamp,
    };
  });
}
