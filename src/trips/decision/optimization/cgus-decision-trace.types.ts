/**
 * CGUS Decision / Utility Trace 契约（V1）。
 *
 * 前半段（排序侧）：OPTIMIZE 写出。
 * 后半段（Outcome Loop）：Trip Review 回写 — user_action → chosen → outcome → regret → diagnosis。
 *
 * 策略：./CGUS_V1_OPERATIONAL_POLICY.md
 * Sprint：./CGUS_V1_OPERATIONAL_VALIDATION_01.md
 *
 * override ≠ failure。仅 override + evidence + diagnosed root cause 才可触发研发。
 */

export const CGUS_DECISION_TRACE_SCHEMA_VERSION = 'cgus-decision-trace/v1' as const;

/**
 * V1 用户决策动作（非 UX 行为）。
 * 点开详情 / 展开解释 / 停留时长 ≠ Decision Result。
 */
export type CgusDecisionUserAction =
  | 'ACCEPT'
  | 'OVERRIDE'
  | 'REJECT_ALL'
  | 'NO_ACTION';

/** @deprecated 使用 CgusDecisionUserAction；保留别名以免旧引用断裂 */
export type CgusUserAction = CgusDecisionUserAction;

/**
 * Trip Review 根因桶（冻结、少量枚举）。
 * WEIGHT / UTILITY 仅在重复证据下才可解冻公式或讨论 L5。
 */
export type CgusDecisionRootCause =
  | 'STATE'
  | 'EVIDENCE'
  | 'FEASIBILITY'
  | 'UTILITY'
  | 'WEIGHT'
  | 'UX'
  | 'CAPABILITY_BOUNDARY'
  | 'NONE'
  | 'UNKNOWN';

/** 运营对「推荐是否成问题」的判定（非自动 Judge） */
export type CgusRecommendationProblematic = 'NO' | 'YES' | 'UNSURE';

/**
 * 决策后悔（与 Override 分离）。
 * 用户 Override ≠ Regret。
 */
export type CgusDecisionRegret = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

/** 事实结果（Outcome），与 Regret 分列 */
export interface CgusActualOutcomeV1 {
  completed: boolean;
  safetyIncident: boolean;
  majorDelayMinutes?: number;
  unexpectedCost?: number;
  userReportedIssue?: string;
}

/** 单候选效用分解（观测字段；不为对齐图 13 发明未实现维） */
export interface CgusCandidateUtilityBreakdownV1 {
  safety?: number;
  experience?: number;
  philosophy?: number;
  risk_penalty?: number;
  /** V1：KNOWN_GAP 时常为 0 */
  budget_penalty?: number;
  /**
   * 诊断用：由 timeSlack 映射为 max(0, 1−timeSlack)。
   * Time：EXISTING_MECHANISM / OBSERVE。
   */
  time_penalty?: number;
  expected_utility?: number;
  utility?: number;
}

export interface CgusDecisionTraceV1 {
  schemaVersion: typeof CGUS_DECISION_TRACE_SCHEMA_VERSION;

  decision_id: string;
  trip_id: string;
  decision_type: string;

  candidate_ids: string[];

  hard_constraint_result: 'all_feasible' | 'partial' | 'none_feasible' | 'masked';
  hard_constraint_reasons: string[];

  candidate_scores: Record<string, CgusCandidateUtilityBreakdownV1>;

  ranking: string[];
  top1_margin?: number;

  /** Nara / CGUS Top1（与 chosen 必须分离） */
  recommended_candidate?: string;

  // ── OPS-CGUS-01：Decision Action Capture ──
  user_action?: CgusDecisionUserAction;
  /** 用户最终采用的候选；REJECT_ALL / NO_ACTION 时应为空 */
  chosen_candidate?: string;
  /** 可选说明；不得单独等同于算法错误 */
  override_reason?: string;
  user_action_captured_at?: string;

  // ── OPS-CGUS-02：Outcome / Regret Writeback ──
  actual_outcome?: CgusActualOutcomeV1;
  decision_regret?: CgusDecisionRegret;
  outcome_captured_at?: string;

  // ── OPS-CGUS-03：Trip Review Diagnosis ──
  recommendation_problematic?: CgusRecommendationProblematic;
  root_cause?: CgusDecisionRootCause;
  review_note?: string;
  reviewed_at?: string;
  reviewed_by?: string;

  /**
   * Policy provenance（P0）：本轮 OPTIMIZE 使用的合同/策略快照出处。
   * 授权字段只记审计，不表示参与了评分。
   */
  contractVersion?: number;
  policyVersion?: number;
  policySource?: string;
  effectiveConstraints?: string[];
  effectiveObjectives?: string[];
  /** 授权未参与评分的显式审计标记 */
  executionAuthorityExcludedFromScoring?: true;
}
