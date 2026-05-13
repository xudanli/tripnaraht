import { buildLedgerEdgesFromNodes } from './decision-ledger-anchors.util';
import type {
  DecisionLedgerSnapshot,
  LedgerEdgeV1,
  LedgerNode,
  LedgerRecomputePlanV1,
} from './decision-ledger.types';
import { planLedgerRecomputeOrder } from './decision-ledger-invalidation.util';
import type { RecomputeDriftContextV1, RecomputePayloadV1, RecomputeStableAnchorNodeV1 } from './recompute-payload.types';

export type AssembleRecomputePayloadOptionsV1 = {
  driftContext?: RecomputeDriftContextV1[];
  /** 省略时由 ledger 现场调用 planLedgerRecomputeOrder */
  plan?: LedgerRecomputePlanV1;
};

function effectiveEdges(ledger: DecisionLedgerSnapshot): LedgerEdgeV1[] {
  return ledger.edges.length > 0 ? ledger.edges : buildLedgerEdgesFromNodes(ledger.nodes);
}

function compactSummary(n: LedgerNode): string {
  const s = n.outputRef.summary?.trim();
  if (s) return s;
  const d = n.outputRef.payloadDigest?.trim();
  if (d) return `digest:${d.length > 12 ? `${d.slice(0, 12)}…` : d}`;
  return `(no summary; node=${n.nodeId})`;
}

/**
 * 从账本快照组装 IncrementalKernel 用的结构化重算载荷：失效子图、稳定锚摘要、漂移说明、拓扑任务序。
 */
export function assembleRecomputePayloadV1(
  ledger: DecisionLedgerSnapshot,
  options?: AssembleRecomputePayloadOptionsV1,
): RecomputePayloadV1 {
  const byId = new Map(ledger.nodes.map(n => [n.nodeId, n]));
  const invalidated = ledger.nodes.filter(n => n.status === 'INVALIDATED');
  const invSet = new Set(invalidated.map(n => n.nodeId));

  const plan = options?.plan ?? planLedgerRecomputeOrder(ledger);
  const orderedTaskIds = [...plan.orderedNodeIds, ...plan.unorderedFallbackNodeIds].filter(id => {
    const n = byId.get(id);
    return n?.status === 'INVALIDATED';
  });

  const orderIndex = new Map(orderedTaskIds.map((id, i) => [id, i]));
  const sortedInvalidated = [...invalidated].sort(
    (a, b) => (orderIndex.get(a.nodeId) ?? 1e9) - (orderIndex.get(b.nodeId) ?? 1e9),
  );

  const edges = effectiveEdges(ledger);
  const incomingEdges = edges.filter(e => invSet.has(e.to));

  const stableRefIds = new Set<string>();
  for (const n of invalidated) {
    for (const p of n.parentIds) stableRefIds.add(p);
    for (const c of n.consumesNodeIds) stableRefIds.add(c);
  }

  const stableAnchorNodes: RecomputeStableAnchorNodeV1[] = [];
  for (const id of stableRefIds) {
    const n = byId.get(id);
    if (!n || n.status !== 'STABLE') continue;
    stableAnchorNodes.push({
      nodeId: id,
      summary: compactSummary(n),
      actionType: n.actionType,
    });
  }
  stableAnchorNodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  return {
    revision: 'v1',
    invalidatedSubGraph: {
      nodes: sortedInvalidated,
      incomingEdges,
    },
    stableAnchorNodes,
    driftContext: options?.driftContext ?? [],
    orderedTaskIds,
  };
}
