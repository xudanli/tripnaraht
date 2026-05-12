/**
 * Temporal propagation — 时钟扰动（相对「只改 endTime」的可追溯抽象）
 */

import type { ExecutionState } from '../hazard/travel-hazard.types';

/** 下游传播策略（后续 Temporal Engine 消费） */
export type PropagationPolicy =
  /** 沿同日时间轴顺序传递（segment drift → arrival drift） */
  | 'PROPAGATE_SEQUENCE'
  /** 预留：跨日（入住 → 次日起床） */
  | 'PROPAGATE_CROSS_DAY'
  /** 仅记录、不自动推移下游（BLOCKED / 人工接管） */
  | 'NO_PROPAGATION'
  /** 全日松散缓冲，未绑定到具体段尾时刻 */
  | 'ACCUMULATE_GLOBAL_SLACK';

export interface TimeDriftCause {
  kind:
    | 'WEATHER_EXECUTION_QUALITY'
    | 'WEATHER_BLOCKED_ADVISORY'
    /** 前一日 PROPAGATE_SEQUENCE 延误汇总 → 跨日传递（v1 spill） */
    | 'CROSS_DAY_SEQUENCE_SPILLOVER'
    /** Corridor route physics overlay（P4-A++），与 TravelLeg 基准 ETA 解耦 */
    | 'ROUTE_EXECUTION_PHYSICS';
  delayFactor?: number;
  executionState?: ExecutionState;
  /** 0–1 — route execution reliability / ETA distribution anchor */
  reliabilityScore?: number;
  /** Corridor ETA band width (minutes), for schedule elasticity / Neptune */
  uncertaintySpreadMinutes?: number;
}

export interface TimeDrift {
  id: string;
  /** ISO 日期（当地行程日） */
  date: string;
  /** 产生扰动的槽位 */
  sourceSlotId: string;
  /** 相对原计划增加的分钟数（非负） */
  deltaMinutes: number;
  /** 0–1 */
  confidence: number;
  propagationPolicy: PropagationPolicy;
  cause: TimeDriftCause;
  narrative?: string;
}
