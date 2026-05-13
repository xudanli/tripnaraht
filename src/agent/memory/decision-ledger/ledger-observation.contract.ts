import type { InputSignaturesV1 } from './decision-ledger.types';

/**
 * 观察契约（C）：在写入 Ledger 节点时，显式声明该决策依赖哪些 world topic 的 digest。
 * 与 `buildWorldTopicSlicesFromTripContext` / `WorldAnchorV1.activeTopics` 的 key 对齐。
 */
export type WorldObservationCommitV1 = Pick<
  InputSignaturesV1,
  'observedWorldTopics' | 'worldTopicDigestsAtCommit' | 'worldCoarseDigestAtCommit'
>;

/**
 * 从当前世界切片表（topic → digest）与 coarseDigest 构造提交快照（topic 名排序便于比对）。
 */
export function buildWorldObservationCommit(input: {
  observedWorldTopics: string[];
  topicDigests: Record<string, string>;
  coarseDigest: string;
}): WorldObservationCommitV1 {
  const topics = [...new Set(input.observedWorldTopics)].sort();
  return {
    observedWorldTopics: topics,
    worldTopicDigestsAtCommit: { ...input.topicDigests },
    worldCoarseDigestAtCommit: input.coarseDigest,
  };
}
