import type { LedgerActionType, LedgerEdgeV1, LedgerNode } from './decision-ledger.types';

export type RecomputeDriftSeverityV1 = 'HARD' | 'SOFT';

/** 解释「为何触发重算」；描述由 MCP / 编排层填入，账本快照本身不携带自然语言。 */
export interface RecomputeDriftContextV1 {
  topic: string;
  description: string;
  severity: RecomputeDriftSeverityV1;
}

export interface RecomputePayloadInvalidatedSubGraphV1 {
  /** 仅 status === INVALIDATED */
  nodes: LedgerNode[];
  /** `to` 落在失效区内的边（含 STABLE→INVALIDATED 与 INVALIDATED 内部依赖） */
  incomingEdges: LedgerEdgeV1[];
}

export interface RecomputeStableAnchorNodeV1 {
  nodeId: string;
  /** 仅摘要，不含 raw payload（认知减负 / 不可变约束区） */
  summary: string;
  actionType: LedgerActionType;
}

/**
 * DecisionLedgerSnapshot → IncrementalKernel / LLM 的最后一次结构化投影（v1）。
 */
export interface RecomputePayloadV1 {
  revision: 'v1';
  invalidatedSubGraph: RecomputePayloadInvalidatedSubGraphV1;
  stableAnchorNodes: RecomputeStableAnchorNodeV1[];
  driftContext: RecomputeDriftContextV1[];
  /** 拓扑序 INVALIDATED 任务 id，语义对齐 planLedgerRecomputeOrder + fallback */
  orderedTaskIds: string[];
}
