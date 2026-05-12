/**
 * 行为捕获：显式 / 隐式 / 结构信号的统一入口（供 Intent Evolution 消费）。
 */

export type BehaviorSignalType =
  | 'explicit_edit'
  | 'explicit_reject'
  | 'explicit_favorite'
  | 'fatigue_rejection'
  | 'pace_complaint'
  | 'distance_override'
  | 'implicit_dwell'
  | 'implicit_skip'
  | 'structural_slot_pattern';

export interface BehaviorSignalBase {
  type: BehaviorSignalType;
  confidence: number;
  /** ISO 时间 */
  observedAt?: string;
}

export interface FatigueRejectionSignal extends BehaviorSignalBase {
  type: 'fatigue_rejection';
  targetSlot?: string;
  targetPlaceId?: number;
  signal: 'too_intense' | 'too_far' | 'too_long';
}

export interface PaceComplaintSignal extends BehaviorSignalBase {
  type: 'pace_complaint';
  direction: 'too_fast' | 'too_slow';
}

export interface DistanceOverrideSignal extends BehaviorSignalBase {
  type: 'distance_override';
  countDelta?: number;
}

export interface ExplicitPlaceSignal extends BehaviorSignalBase {
  type: 'explicit_reject' | 'explicit_favorite';
  placeId: number;
}

export type BehaviorSignal =
  | BehaviorSignalBase
  | FatigueRejectionSignal
  | PaceComplaintSignal
  | DistanceOverrideSignal
  | ExplicitPlaceSignal;
