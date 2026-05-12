import type { ConstraintDependencyEdge } from './constraint-edge.types';
import type { PropagationPolicy, TimeDrift } from './time-drift.types';
import type {
  ConstraintDomain,
  UnifiedConstraintGraphSnapshot,
} from '../constraint-graph/unified-constraint-graph.types';

/**
 * 单次决策引擎 pass 发出的时空传播快照（可持久化 / 回放）
 */
export interface TemporalPropagationSnapshot {
  timeDrifts: TimeDrift[];
  constraintEdges: ConstraintDependencyEdge[];
  emittedAt: string;
  /** sequence 传播后平移过的槽位 id（v1 downstream sweep） */
  downstreamShiftedSlotIds?: string[];
  /** 跨日传播后平移过的次日槽位 id（v1） */
  crossDayShiftedSlotIds?: string[];
  /** 多域统一约束图视图（P1：与 weather temporal 同源汇总） */
  unifiedConstraintGraph?: UnifiedConstraintGraphSnapshot;
}

/**
 * `ExternalSignalsState.temporalPropagation` — 引擎写入的可序列化摘要
 */
export interface TemporalPropagationSignalSummary {
  emittedAt: string;
  driftCount: number;
  constraintEdgeCount: number;
  /** deltaMinutes 之和（仅限 PROPAGATE_SEQUENCE） */
  totalSequenceDeltaMinutes: number;
  /** deltaMinutes 之和（ACCUMULATE_GLOBAL_SLACK） */
  totalGlobalSlackMinutes: number;
  policyCounts: Partial<Record<PropagationPolicy, number>>;
  downstreamShiftedSlotCount: number;
  downstreamShiftedSlotIds?: string[];
  /** PROPAGATE_CROSS_DAY drift 条数 */
  crossDayDriftCount: number;
  /** 跨日 drift 的 deltaMinutes 之和 */
  totalCrossDayDeltaMinutes: number;
  crossDayShiftedSlotCount: number;
  crossDayShiftedSlotIds?: string[];
  /** `plan.temporal.unifiedConstraintGraph.stats` 的轻量副本（无图体） */
  unifiedConstraintGraphStats?: {
    version: '1';
    nodeCount: number;
    edgeCount: number;
    driftNodeCount: number;
    slotNodeCount: number;
    bookingDeadlineNodeCount?: number;
    domainNodeCounts?: Partial<Record<ConstraintDomain, number>>;
    domainEdgeCounts?: Partial<Record<ConstraintDomain, number>>;
  };
}

/** `ExternalSignalsState.operationalDayWindow` — 营运日窗（非天文日照）越界摘要 */
export interface OperationalDayWindowSignalSummary {
  dayStart: string;
  dayEnd: string;
  violationCount: number;
  outOfWindowSlotIds: string[];
}

/** `ExternalSignalsState.daylightFeasibility` — 民用晨光/暮光相对敏感槽位 */
export interface DaylightFeasibilitySignalSummary {
  latitudeDeg: number;
  longitudeDeg: number;
  slotsEndingAfterCivilDusk: string[];
  slotsStartingBeforeCivilDawn: string[];
  violationCount: number;
}
