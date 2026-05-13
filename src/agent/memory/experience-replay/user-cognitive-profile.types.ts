/**
 * 4.0 Experience Replay — UserCognitiveProfile（认知侧写）
 *
 * 约束（Constraint Set 1.0）摘要：
 * - 隐私最小化：仅存聚合标量与计数/枚举，不存用户自然语言原文。
 * - 非阻塞：加载须在 `MEMORY_KERNEL_LOAD_BUDGET_MS` 内完成，否则上层应丢弃并走 3.0 默认。
 * - 溯源：凡影响决策的偏置须打 `MEMORY_REPLAY_DECISION_SOURCE`（见 `memory-replay.constants.ts`）。
 */

export const USER_COGNITIVE_PROFILE_SCHEMA_VERSION = 1 as const;

/** 有界标量 [0, 1]，语义依字段名解释 */
export type Score01 = number;

/**
 * 合规/安全叙事相对「体验/探索」叙事的聚合偏置，范围 [-1, 1]。
 * - 接近 +1：历史结构化信号显示系统多次处于 COMPLIANCE_FIRST 等偏安全仲裁。
 * - 接近 -1：更常出现 COMMERCE_OVER_EXPERIENCE 等偏务实/体验张力（不代表用户说脏话，仅叙事立场统计）。
 * - 0：样本不足或相互抵消。
 */
export type ComplianceExperienceAxis = number;

/**
 * 从 DecisionLog 可安全摄入的一条切片（由上游从完整 Entry 投影而来，禁止附带 message 全文）。
 * 仅包含 Experience Replay 允许使用的字段。
 */
export type DecisionLogCognitiveSlice = {
  step: string;
  timestamp: string;
  metadata?: {
    ebp_stance?: string;
    effective_voice_tone?: string | null;
    conflict_count?: number;
    /** 若存在，须为枚举/短码，不得为自由文本 */
    decision_source?: string;
    /**
     * 结构化用户反馈标签（仅允许 `COGNITIVE_NEGATIVE_FEEDBACK_TAGS` 子集；由上游从 NLU / 审计写入）。
     */
    user_feedback_tags?: readonly string[];
    /** 研究/编排侧审计标签（同上，白名单子集） */
    research_audit_tags?: readonly string[];
  };
};

/**
 * 用户认知档案：跨 Session 可序列化的「决策倾向」摘要。
 * `subject_ref` 须由调用方提供不透明主语键（如 hash(userId)），本层不解析 PII。
 */
export type UserCognitiveProfile = {
  schema_version: typeof USER_COGNITIVE_PROFILE_SCHEMA_VERSION;
  subject_ref: string;
  updated_at: string;
  /** 参与聚合的 NARRATE（或其它白名单 step）切片数 */
  evidence_weight: number;
  /** 合规—体验轴 */
  compliance_experience_axis: ComplianceExperienceAxis;
  /** 价格/性价比敏感度代理（无信号时为 0） */
  price_sensitivity_proxy: Score01;
  /** 对「缝合透明」叙事语气的暴露频次代理，越高表示系统更常进入安抚透明态 */
  stitch_transparency_exposure_proxy: Score01;
  /**
   * [0,1]：近期「带 MEMORY_REPLAY 溯源的立场化 NARRATE」在日志时间序上遭用户结构化否定（见 `COGNITIVE_NEGATIVE_FEEDBACK_TAGS`）的比例代理。
   * 无记忆复盘立场行或尚无否定信号时为 0。
   */
  negative_feedback_proxy: Score01;
  /** 结构化溯源计数（可回放，不含原文） */
  derivation: {
    narrate_compliance_first_hits: number;
    narrate_commerce_over_experience_hits: number;
    narrate_stitch_transparency_voice_hits: number;
    /** 有冲突时的平均 conflict_count；无则 null */
    mean_conflict_count_when_nonzero: number | null;
    /** `decision_source === MEMORY_REPLAY` 且 ebp 参与轴加权的 NARRATE 条数 */
    memory_replay_axis_narrate_hits: number;
    /** 上述条目中，时间序后紧跟否定标签的条数 */
    memory_replay_penalized_hits: number;
  };
  /**
   * 预留：来自结构化反馈槽（如 thumbs / enum follow-up），非 NLU 原文；
   * 4.0+ 用于「COMPLIANCE_FIRST 多次后用户显式偏好体验」类动态 EBP。
   */
  structured_experience_priority_signals?: number;
};
