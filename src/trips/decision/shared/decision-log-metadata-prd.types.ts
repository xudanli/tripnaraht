/**
 * PRD Decision OS：写入 `DecisionLogEntry.metadata` / DB JSON 的约定字段。
 * 文档：`docs/TRIPNARA_DECISION_OS_PRD0506.md` §13、§I4、§I6
 *
 * 均为可选；逐步补齐，不在 DB 层新增列，仅存 metadata JSON。
 */

/** 用户可见风险分层（I6） */
export type DecisionRiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 责任模式：谁对下一步动作负责（I6）
 * - ASSIST_ONLY：建议，不触发履约
 * - CONFIRM_REQUIRED：需用户确认
 * - HUMAN_ONLY：仅人工可推进
 */
export type DecisionResponsibilityMode = 'ASSIST_ONLY' | 'CONFIRM_REQUIRED' | 'HUMAN_ONLY';

/** Hard 裁决优先于模型叙事时（I4） */
export type HardSoftArbitration = {
  winner: 'HARD' | 'SOFT';
  /** 是否阻止了模型覆盖 Hard */
  model_override_prevented?: boolean;
};

/** Hard 数据时效（§13.D stale_risk） */
export type StaleRiskHint = {
  /** 是否标注为可能过时 */
  flagged: boolean;
  /** 采集或查询时间 ISO8601 */
  observed_at?: string;
  /** 数据版本或 provider tag */
  source_version?: string;
};

/**
 * 与 I5 `OrchestratorFailureDomain` 对齐的域标签（本层不依赖 agent 包，值集保持一致即可）。
 */
export type RecoveryAuditFailureDomain =
  | 'TIMEOUT'
  | 'TOOL'
  | 'LLM'
  | 'NETWORK'
  | 'BUSINESS_RULE'
  | 'ORCHESTRATION'
  | 'UNKNOWN';

/**
 * 编排外层 Recovery 重试时写入 `decision_log.metadata.recovery_context`，便于审计 / 回放 / RL 样本筛选。
 */
export type DecisionRecoveryLogContext = {
  is_retry: boolean;
  /** 本次 route_and_run 内第几次 SM 调用（含首次失败后的第 1 次重试 = 1） */
  retry_attempt: number;
  /** 触发本次重试的前序失败域（本次 SM 调用所响应的失败分类） */
  previous_failure_domain: RecoveryAuditFailureDomain;
  /** 相对编排外层请求起点的耗时（wall-clock） */
  elapsed_from_start_ms: number;
};

/**
 * 研究/编排「体验优先 vs 稳健收窄」叙事轨（TD-05 traceSignals 与线上日志对齐用）。
 * - EMPATHY_RECOVERY：挫败感熔断、歉意恢复优先
 * - EXPERIENCE_FIRST：天气与路况窗口恢复后的正常体验探索
 */
export type DecisionNarrativeTrack = 'EMPATHY_RECOVERY' | 'EXPERIENCE_FIRST' | (string & {});

/** PRD 扩展字段集合（嵌于 metadata） */
export type DecisionLogMetadataPrd = {
  risk_tier?: DecisionRiskTier;
  responsibility_mode?: DecisionResponsibilityMode;
  arbitration?: HardSoftArbitration;
  stale_risk?: StaleRiskHint;
  /** 关联审批（HITL） */
  approval_id?: string;
  /** 与 Orchestrator / Trip 侧计划版本对齐时的冗余 */
  plan_version?: number;
  /** Phase B+：外层指数退避重试上下文（与 observability.recovery_trace 对齐） */
  recovery_context?: DecisionRecoveryLogContext;
  /**
   * Multi-Agent 研究链路是否处于「稳健/收窄」模式（如高挫败、实时重跑触顶后与 flight/hotel research 对齐）。
   * 写入 PLAN_SCORE 等阶段 metadata，供回放与线上溯源。
   */
  stability_mode_active?: boolean;
  /** 与 `UserEmotionalAccount` / ToleranceCalculator 挫败感熔断对齐的可观测标记 */
  frustration_circuit_triggered?: boolean;
  /** 当前用户可见叙事主轨（6.x 与 TripNARA Narrator 输入对齐） */
  narrative_track?: DecisionNarrativeTrack;
  /**
   * 审计：Leader `research_data.__research_trace_signals.frustration_threshold` 快照（与 TD-05 / 日志映射一致）。
   */
  _audit_frustration_threshold?: number;
  /** ExperienceFlow 第四投影快照（DPO/SFT 行为↔体验收益对齐） */
  experience_flow?: {
    tempo?: string;
    heterogeneityIndex?: number;
    surpriseBuffer?: number;
    currentFrictionCapacity?: number;
    narrativeTone?: string;
  };
};

const CRITICAL_ACTIONS = new Set<string>(['REJECT', 'ADJUST', 'REPLACE', 'MODIFY']);

/** 与 `DecisionAction` 中关键审计动作一致（PRD §13.B） */
export function isCriticalDecisionAction(
  action: string,
): action is 'REJECT' | 'ADJUST' | 'REPLACE' | 'MODIFY' {
  return CRITICAL_ACTIONS.has(action);
}

export function isCriticalDecisionActionValue(action: string): boolean {
  return CRITICAL_ACTIONS.has(action);
}
