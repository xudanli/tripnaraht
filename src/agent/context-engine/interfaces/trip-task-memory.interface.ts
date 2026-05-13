// src/agent/context-engine/interfaces/trip-task-memory.interface.ts
/**
 * 旅行任务记忆（Trip Task Memory）
 *
 * Context Orchestrator 第三优先级：当前行程状态、已选路线、中间决策
 * 参考：docs/CONTEXT_ORCHESTRATOR_IMPLEMENTATION_PLAN.md 5.2
 */

export type TripTaskPhase =
  | 'intake'
  | 'route_selection'
  | 'poi_candidate'
  | 'decision'
  | 'confirm';

/**
 * 任务级持久记忆（Redis）；与 PRD「Trip Task」语义对齐的增量字段均为可选。
 * 见 `docs/TRIPNARA_DECISION_OS_PRD0506.md` §5.1
 */
export interface TripTaskMemory {
  tripId: string;
  currentPhase: TripTaskPhase;
  selectedRouteDirectionId?: string;
  decisionLogSummary: string;
  artifactsRefs: string[];
  lastUpdated: string; // ISO 8601
  /** 用户目标摘要（自然语言或结构化由上层约定） */
  goal?: string;
  /**
   * 结构化约束（预算、禁行、体能等）。
   * 约定键（非穷尽）：`toolAllowlist` — 与 ContextPackage.metadata.toolAllowlist 对齐；
   * 由 ContextEngineer 在每次 context build（且 includeToolSelection 未关闭）后写入，供 Agentic MCP Runtime Cap 等读取（见 extractAgenticSkillAllowlistForMcpCap）。
   * `tool_policies` — MCP toolName → `{ mode: 'auto'|'ask'|'deny', reason? }`；与 FEATURE_AGENTIC_GOVERNANCE_HITL 合并后由 McpAgentExecutorService 在 dispatch 前执行硬闸。
   * `approved_tool_invocations` — HITL 续跑：`string[]` 或 `{ tool_call_id, mcp_tool_name? }[]`；与 options.agentic_approved_tool_invocations 合并后，对 `ask` 工具在匹配 id（及可选 mcp 名）时放行真实 MCP。
   */
  constraints?: Record<string, unknown>;
  /** 执行态快照标签（如 pending_confirm / replanning） */
  execution_state?: string;
  /** 风险摘要或结构化风险状态 */
  risk_state?: Record<string, unknown>;
  /** 简短事件历史，便于 replan 继承 previous world 调试 */
  history?: Array<{
    at: string;
    event: string;
    payload?: Record<string, unknown>;
  }>;
  /**
   * Recovery / I5 外层编排审计尾（与 TripRun recovery_audit 互补；便于按域 / 是否重试过滤）。
   */
  recovery_audit_tail?: TripTaskRecoveryAuditLine[];
}

/** 单行 Recovery 审计（Trip Task Memory 索引；非 DB decision_logs 表） */
export type TripTaskRecoveryAuditLine = {
  at: string;
  request_id: string;
  phase?: string;
  is_retry?: boolean;
  retry_attempt?: number;
  backoff_ms?: number;
  failure_domain?: string;
  failure_code?: string;
  recovery_plan_kind?: string | null;
};
