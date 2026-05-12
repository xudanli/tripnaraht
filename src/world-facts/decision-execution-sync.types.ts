import type { ActionDispatchTrace } from './decision-dispatch.types';

/** Trip.metadata.decisionExecutionHistory 单条（P4 状态回写） */
export interface TripDecisionExecutionHistoryEntry {
  id: string;
  occurredAt: string;
  countryCode: string;
  routeDirectionId?: string;
  /** 摘要：各 trace 的 status / actionType */
  traceSummary: { actionIndex: number; actionType: string; status: string }[];
  rollbackTokenCount: number;
  /** 至少一条 SUCCESS */
  hadSuccessfulDispatch: boolean;
}

export interface RouteDispatchExecutionSyncInput {
  countryCode: string;
  routeDirectionId?: string;
  traces: ActionDispatchTrace[];
  rollbackTokens: string[];
  /** 若请求携带 tripId，则合并写入 Trip.metadata */
  tripId?: string;
}

export interface RouteDispatchExecutionSyncResult {
  tripStateUpdated: boolean;
  /** 需 DECISION_EXECUTION_WORLD_FACT_SYNC=1 且存在 SUCCESS trace */
  worldFactAppended: boolean;
  worldFactRowId?: string;
}
