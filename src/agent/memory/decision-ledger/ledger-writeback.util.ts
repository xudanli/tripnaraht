import type { LedgerAnchorsV1, LedgerNode, InputSignaturesV1 } from './decision-ledger.types';

/**
 * 将节点 inputSignatures 对齐当前账本锚，避免写回后立即被 {@link invalidateLedgerByAnchorDrift} 再次标根。
 */
export function syncLedgerNodeInputSignaturesToAnchors(n: LedgerNode, anchors: LedgerAnchorsV1): InputSignaturesV1 {
  const wl = anchors.worldLayered;
  return {
    ...n.inputSignatures,
    budgetAnchor: anchors.budget,
    preferenceAnchor: anchors.preference,
    policyAnchor: anchors.policy,
    worldAnchor: anchors.world,
    worldCoarseDigestAtCommit: wl.coarseDigest,
    worldTopicDigestsAtCommit: { ...wl.activeTopics },
  };
}
