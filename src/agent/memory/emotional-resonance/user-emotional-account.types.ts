/**
 * 6.0 Emotional Resonance — 心理账户与容忍度溢价（纯类型；无 IO）。
 * 与 4.0 `UserCognitiveProfile`、5.0 `AccumulatedResearchFinancialReport` 解耦消费，仅在计算器层组合。
 */

/** 会话内可观测的「感性资产」快照（供协商 / Narrator / 审计）。 */
export type UserEmotionalAccount = Readonly<{
  /** [0,1]：由节省与交付质量信号聚合的好感代理（首版：财务为主） */
  accumulated_goodwill: number;
  /** [0,1]：当前容忍度溢价（舒适度 / 便捷度叙事弹性，非安全域） */
  current_tolerance_bonus: number;
  /** [0,1]：挫败感代理（首版：负反馈 + 安全叙事张力） */
  frustration_score: number;
}>;

/**
 * 6.0：心理抵扣建议 — 供 `ResearchConflictNegotiationReport` 与缝合策略消费。
 * `suture_aggressive_allowed` 仅放宽「舒适度/便捷度」类叙事合并，**不**放宽安全/合规红线。
 */
export type MentalOffsetHints = Readonly<{
  suture_aggressive_allowed: boolean;
  /** [0,1] 与报告根字段 `tolerance_bonus` 对齐 */
  tolerance_bonus: number;
  /** 6.1：挫败感熔断激活时，下游须关闭激进缝合与「表功式」省钱叙事 */
  frustration_circuit_active?: boolean;
  /** 6.3：纳入挫败感水位的实时重跑计数（审计） */
  realtime_reroll_count?: number;
  /** 可观测的 DTI-lite 分解（便于回放与调参） */
  dti_components?: Readonly<{
    base_tolerance: number;
    savings_term: number;
    safety_penalty: number;
    experience_bias_term: number;
  }>;
}>;
