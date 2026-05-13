/**
 * ContextTopic / 世界切片新鲜度契约（B）：与 Decision Ledger 锚桥接，供 coarse/fine 双层 digest。
 */

export type TopicGranularity = 'COARSE' | 'FINE';

export type TopicStalePolicy = 'REFRESH_SYNC' | 'REFRESH_ASYNC' | 'MARK_STALE';

export interface TopicFreshnessV1 {
  granularity: TopicGranularity;
  ttlMs: number;
  stalePolicy: TopicStalePolicy;
}

export interface WorldTopicSliceMetaV1 {
  version: string;
  fetchedAt: number;
  /** 本 topic 载荷的稳定 digest（与 stableDigest 一致） */
  digest: string;
  freshness: TopicFreshnessV1;
}

export interface WorldTopicSlice<T = unknown> {
  topic: string;
  data: T;
  meta: WorldTopicSliceMetaV1;
}

/** Memory 装配路径上的相位（与内核 DecisionState.phase 解耦；由 trip 任务态推断）。 */
export type MemoryLedgerPhaseV1 = 'PLANNING' | 'GATE_EVAL' | 'EXECUTION';
