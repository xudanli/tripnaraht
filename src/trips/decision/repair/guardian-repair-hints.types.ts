import type { RepairAction } from './repair-action.types';

export interface GuardianFatigueDayPrediction {
  dayIndex: number;
  fatigueScore: number;
  riskLevel: string;
  recommendation: string;
  confidence?: number;
}

export interface GuardianRepairHintItem {
  text: string;
  source: 'condition' | 'suggested_adjustment' | 'human_decision_point' | 'key_tradeoff';
  persona?: 'ABU' | 'DRE' | 'NEPTUNE';
  inferredAction?: RepairAction;
  /** 1-based 行程日（来自文案 Day2/第3天 或 TDFPM） */
  dayIndex?: number;
  targeting?: 'explicit_text' | 'tdfpm' | 'fallback';
}

/** 三人格辩论输出 — 供 readiness repair → Neptune 修复上下文 */
export interface GuardianRepairHints {
  decision: string;
  consensusLevel: number;
  items: GuardianRepairHintItem[];
  sourcePhase: 'pre_repair' | 'post_repair' | 'standalone';
  negotiatedAt: string;
  fatiguePrediction?: GuardianFatigueDayPrediction[];
}
