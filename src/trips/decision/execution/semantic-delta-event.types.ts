/**
 * Semantic Delta Model — v0 schema only（无增量物化逻辑）
 *
 * Phase 3 将在此收敛 payload，并由 reducer 做 partial mutation；
 * 当前生产路径仍必须经 `fullRebuildFallback` 或 `ENGINE_FULL_REBUILD` 保证一致性。
 */

import type { PlanDiff } from '../../replan/partial-replan.executor';
import type { SlotRepairPlan } from '../../repair/slot-repair.types';
import type { TripAction } from '../../road/trip-action.types';
import type { SemanticImpactDeclaration } from './semantic-impact.types';

/** 域级语义差分类（taxonomy）；与运行时 `SEMANTIC_DELTA` 事件配对 */
export type SemanticDeltaKind =
  | 'WEATHER_UPDATE'
  | 'BOOKING_CONFLICT'
  | 'FATIGUE_ACCUMULATION'
  | 'ROUTE_DELAY'
  /** 路网可达性闭包变化（RoadConstraintPropagation → replan） */
  | 'ROAD_CONSTRAINT_CHANGE'
  /** 多域融合后的槽位阻断（Constraint Fusion → Neptune） */
  | 'SLOT_BLOCKED'
  /** 槽位修复建议（Repair Engine → Planner / 自动改写入口） */
  | 'SLOT_REPAIR_SUGGESTED'
  /** 局部重规划已执行（Partial Replan Runtime） */
  | 'PARTIAL_REPLAN_EXECUTED'
  /** 约束流 + 增量 diff 驱动的局部重规划（Real-time streaming runtime） */
  | 'STREAMING_REPLAN'
  /** 自愈控制器状态（Self-Healing Runtime） */
  | 'SELF_HEALING_STATE';

/** v0：占位；Phase 3 填入可合并结构 */
export type WeatherSemanticDeltaPayloadV0 = Record<string, never>;
export type BookingSemanticDeltaPayloadV0 = Record<string, never>;
export type FatigueSemanticDeltaPayloadV0 = Record<string, never>;
export type RouteDelaySemanticDeltaPayloadV0 = Record<string, never>;

/** 路网约束传播摘要（与 ConstraintImpactV0 对齐） */
export interface RoadConstraintSemanticDeltaPayloadV0 {
  readonly triggerRoadIds: readonly string[];
  readonly affectedPoiIds: readonly string[];
  readonly affectedSegmentIds: readonly string[];
  readonly severity: 'ADVISORY' | 'STRUCTURAL';
  readonly replanRequired: boolean;
  readonly affectedDates: readonly string[];
  /** Trip Impact Resolver：日历日 / 槽位级影响 */
  readonly tripAffectedDays?: readonly string[];
  readonly tripAffectedSlotIds?: readonly string[];
  readonly tripImpactSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly requiredActions?: readonly TripAction[];
}

/** SLOT_BLOCKED：融合层输出的阻断槽位列表 */
export interface SlotBlockedSemanticDeltaPayloadV0 {
  readonly blockedSlots: ReadonlyArray<{
    readonly slotId: string;
    readonly blockingDomains: readonly string[];
    readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
    readonly riskScore: number;
  }>;
}

/** SLOT_REPAIR_SUGGESTED：对阻断槽位的修复方案列表 */
export interface SlotRepairSuggestedSemanticDeltaPayloadV0 {
  readonly repairs: readonly SlotRepairPlan[];
}

export interface PartialReplanExecutedSemanticDeltaPayloadV0 {
  readonly changedSlotIds: readonly string[];
  readonly boundarySlotIds: readonly string[];
  readonly diff: PlanDiff;
}

/** STREAMING_REPLAN：Constraint Stream → diff → partial replan 结果摘要 */
export interface StreamingReplanSemanticDeltaPayloadV0 {
  readonly planDiff: PlanDiff;
  readonly constraintDiff: {
    readonly changedSlots: readonly string[];
    readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
    readonly requiresReplan: boolean;
  };
  readonly normalizedEventId: string;
}

export interface SelfHealingStateSemanticDeltaPayloadV0 {
  readonly status: 'STABLE' | 'UNSTABLE' | 'RECOVERING';
  readonly iteration: number;
  readonly remainingIssues: number;
  readonly stabilityScore?: number;
  readonly shouldPauseStream?: boolean;
}

export type SemanticDeltaEvent =
  | {
      kind: 'WEATHER_UPDATE';
      payload: WeatherSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'BOOKING_CONFLICT';
      payload: BookingSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'FATIGUE_ACCUMULATION';
      payload: FatigueSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'ROUTE_DELAY';
      payload: RouteDelaySemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'ROAD_CONSTRAINT_CHANGE';
      payload: RoadConstraintSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'SLOT_BLOCKED';
      payload: SlotBlockedSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'SLOT_REPAIR_SUGGESTED';
      payload: SlotRepairSuggestedSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'PARTIAL_REPLAN_EXECUTED';
      payload: PartialReplanExecutedSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'STREAMING_REPLAN';
      payload: StreamingReplanSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    }
  | {
      kind: 'SELF_HEALING_STATE';
      payload: SelfHealingStateSemanticDeltaPayloadV0;
      impact: SemanticImpactDeclaration;
    };
