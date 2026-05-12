/**
 * Intent ↔ Reality reconciliation — 共享类型（语义视图叠加 / Neptune）
 */

import type { TripPlan } from '../decision/plan-model';

export interface IntentConflict {
  readonly type: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly detail?: string;
}

export interface Tradeoff {
  readonly id: string;
  readonly description: string;
  readonly impact: 'LOW' | 'MEDIUM' | 'HIGH';
}

/** 物理世界与行程度量快照（由 ETA / 路网 / 气象汇总） */
export interface RealitySnapshot {
  readonly totalDriveHours: number;
  /** 单日最大驾驶时长估计 */
  readonly dailyDriveHoursMax: number;
  readonly blockedSegmentCount?: number;
  readonly worstWeatherTier?: 'HARD' | 'SOFT' | 'NONE';
}

export interface ReconciliationResult {
  readonly conflicts: readonly IntentConflict[];
  readonly alignedPlan: TripPlan;
  readonly tradeoffs: readonly Tradeoff[];
}

/** 挂在 UnifiedExecutionSemanticView 上的对齐摘要 */
export interface IntentReconciliationOverlay {
  readonly conflicts: readonly IntentConflict[];
  readonly tradeoffs: readonly Tradeoff[];
  readonly priorities: readonly string[];
}
