/**
 * Narrator 3.0 / MAT 3.0：多 Agent 研究冲突协商（Evidence-Based Priority 的可观测输出）。
 * 纯数据结构，无 IO；由 merge manifest + team_merge_summary 推导。
 */

import type { MentalOffsetHints, UserEmotionalAccount } from '../../memory/emotional-resonance/user-emotional-account.types';

export const RESEARCH_CONFLICT_NEGOTIATION_VERSION = 1 as const;

/** 可机器消费的冲突族（可随域模型扩展）。 */
export type ResearchConflictKind =
  /** 两名及以上 Peer Member 在同一顶层 research_data 键上均产生写入（合并序后的「意见分叉」信号） */
  | 'KEY_WRITE_CONTENTION'
  /** Compliance 与 酒店/机票 域在同一轮均有实质更新 */
  | 'CROSS_DOMAIN_COMPLIANCE_COMMERCE'
  /** Compliance 与 目的地/体验域在同一轮均有实质更新 */
  | 'CROSS_DOMAIN_COMPLIANCE_EXPERIENCE'
  /** 目的地体验 与 商业域 同时强更新且无 Compliance 同轮信号（典型 trade-off 叙事） */
  | 'CROSS_DOMAIN_EXPERIENCE_COMMERCE'
  /** 同时存在 Member 成功 Patch 与 FALLBACK_SUTURE（韧性缝合与实时成员并存） */
  | 'SUTURE_COEXISTENCE';

/**
 * Evidence-Based Priority（EBP）在叙事侧的默认立场，供 Narrator / UI 选用。
 * Safety(Compliance) > Budget(Commerce) > Experience(Destination)；缝合场景单独透明化。
 */
export type EbpNarrativeStance =
  | 'COMPLIANCE_FIRST'
  | 'COMMERCE_OVER_EXPERIENCE'
  | 'STITCH_TRANSPARENCY'
  | 'BALANCED';

/** 6.1：STITCH 叙事坍缩策略（舒适度/便捷度域；不作用于安全/合规披露） */
export type ResearchStitchTactic = 'TRANSPARENT_SEGMENTED' | 'AGGRESSIVE_COMPENSATION';

export type ResearchConflictNegotiationItem = {
  kind: ResearchConflictKind;
  summary: string;
  detail?: Record<string, unknown>;
};

/** 4.0：记忆层对 EBP 主立场的可追溯软化（写入 `__research_conflict_negotiation` / 审计） */
export type ResearchConflictMemoryReplayMeta = {
  decision_source: 'MEMORY_REPLAY';
  softened_primary_stance: boolean;
  raw_primary_stance: EbpNarrativeStance;
  final_primary_stance: EbpNarrativeStance;
};

export type ResearchConflictNegotiationReport = {
  version: typeof RESEARCH_CONFLICT_NEGOTIATION_VERSION;
  /** 是否存在任一需在叙述中显式处理的冲突族 */
  has_conflicts: boolean;
  /** 去重后的冲突族列表 */
  conflict_flags: ResearchConflictKind[];
  /** EBP 默认叙事立场（终审式建议，不替代具体文案生成） */
  primary_narrative_stance: EbpNarrativeStance;
  items: ResearchConflictNegotiationItem[];
  /** 若存在，表示 `primary_narrative_stance` 曾受 Experience Replay 认知轴调整 */
  memory_replay?: ResearchConflictMemoryReplayMeta;
  /**
   * 6.0 [0,1]：舒适度/便捷度类瑕疵的叙事容忍度溢价（由 4.0 认知 + 5.0 财务组合；**不**用于放宽安全/合规）。
   * 与 `mental_offset_hints.tolerance_bonus` 一致。
   */
  tolerance_bonus?: number;
  /** 6.0：心理抵扣建议（如 SUTURE 激进合并开关），供缝合/协商与 Narrator 消费 */
  mental_offset_hints?: MentalOffsetHints;
  /** 6.0：可观测心理账户快照（审计 / 回放） */
  user_emotional_account?: UserEmotionalAccount;
  /**
   * 6.1：当主立场为 STITCH_TRANSPARENCY 且存在 SUTURE_COEXISTENCE 时，指示叙述/合并策略。
   * `AGGRESSIVE_COMPENSATION` 仅在 `mental_offset_hints.suture_aggressive_allowed` 为 true 时出现。
   */
  stitch_tactic?: ResearchStitchTactic;
};
