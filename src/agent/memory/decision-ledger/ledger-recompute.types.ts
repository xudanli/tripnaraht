import type { LedgerActionType, LedgerNodeStatus } from './decision-ledger.types';

export type LedgerRecomputeStrategyV1 = 'FULL_REPLAN' | 'REFRESH_SUMMARY' | 'NO_OP';

/** 单节点重算意图（由执行器解析；实际 LLM/MCP 由上层编排接入）。 */
export interface LedgerRecomputeStepV1 {
  nodeId: string;
  actionType: LedgerActionType;
  status: LedgerNodeStatus;
  strategy: LedgerRecomputeStrategyV1;
}

export interface LedgerRecomputeExecutorResultV1 {
  revision: 'v1';
  /** 拓扑序 + fallback 的 INVALIDATED 节点 */
  invalidatedSteps: LedgerRecomputeStepV1[];
  /** 账本中仍为 STALE 的节点（摘要刷新 / 异步证据链，不等同于全量重规划） */
  staleSteps: LedgerRecomputeStepV1[];
}
