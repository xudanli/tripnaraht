/**
 * TravelEvent Ledger — State & Learning Foundation P1。
 * 使 Decision / PlanVersion / ActionReceipt / AgentTurnTrace 可关联。
 * Append-only；不替代 GovernanceLedger / DecisionLedger DAG。
 */

export const TRAVEL_EVENT_LEDGER_SCHEMA = 'nara.travel_event_ledger@v1' as const;

export type TravelEventKind =
  | 'DECISION'
  | 'PLAN_VERSION'
  | 'ACTION_RECEIPT'
  | 'AGENT_TURN_TRACE'
  | 'LIVE_RISK'
  | 'OUTCOME'
  /** Hardening 因果链扩展（不扩大 Memory 类型） */
  | 'TASK'
  | 'PROPOSAL'
  | 'VERIFY';

export type TravelEventCorrelation = {
  tripId: string;
  turnId?: string | null;
  taskId?: string | null;
  decisionId?: string | null;
  actionId?: string | null;
  planVersion?: number | null;
  agentTurnTraceSchema?: string | null;
  worldStateProjectedAt?: string | null;
  /** 同 turn 因果链锚 */
  causalChainId?: string | null;
};

export type TravelEventLedgerEntryV1 = {
  schemaId: typeof TRAVEL_EVENT_LEDGER_SCHEMA;
  version: 1;
  eventId: string;
  kind: TravelEventKind;
  occurredAt: string;
  correlation: TravelEventCorrelation;
  /** 轻量载荷；禁止把 Memory 当事实写入 */
  payload: Record<string, unknown>;
  /** 明确：Ledger 事件 ≠ Truth */
  truthPolicy: 'LEDGER_RECORD_ONLY';
};

export type TravelEventLedgerQuery = {
  tripId: string;
  kind?: TravelEventKind;
  decisionId?: string;
  actionId?: string;
  turnId?: string;
  limit?: number;
};
