/**
 * Multi-domain Unified Constraint Graph（v1）
 *
 * 将 PlanSlot、TimeDrift、拓扑边汇合为同一套节点/边 ID，供后续 Booking/EV/Fatigue 等域扩展。
 */

import type { ActivityType } from '../world-model';
import type { SlotDependencyKind } from '../temporal/constraint-edge.types';
import type { PropagationPolicy } from '../temporal/time-drift.types';

/** 约束域（扩展 Booking / EV / Road 时incremental 增加枚举成员即可） */
export type ConstraintDomain =
  | 'WEATHER'
  | 'DAYLIGHT'
  | 'OPERATIONAL_WINDOW'
  | 'SCHEDULE_TOPOLOGY'
  | 'CROSS_DAY_SPILLOVER'
  | 'BOOKING'
  | 'EV_ENERGY'
  | 'FATIGUE'
  | 'ROAD_NETWORK';

export type UnifiedConstraintNodeKind =
  | 'PLAN_SLOT'
  | 'TIME_DRIFT'
  /** 策略给出的最晚入住参考（抽象锚点，便于 BOOKING 域着色） */
  | 'BOOKING_DEADLINE_ANCHOR';

export interface UnifiedConstraintNode {
  id: string;
  kind: UnifiedConstraintNodeKind;
  /** 节点主域（着色/筛选） */
  domain: ConstraintDomain;
  date?: string;
  slotId?: string;
  activityType?: ActivityType;
  /** TIME_DRIFT 专用 */
  drift?: {
    propagationPolicy: PropagationPolicy;
    deltaMinutes: number;
    causeKind?: string;
  };
  /** BOOKING_DEADLINE_ANCHOR：入住窗口相对策略的违规摘要 */
  booking?: {
    latestAllowedTime: string;
    violated: boolean;
    arrivalTime?: string;
    gapMinutes?: number;
  };
}

export type UnifiedTopologyEdgeKind =
  | SlotDependencyKind
  | 'DRIFT_SOURCE_LINK'
  /** 锚点 → 酒店槽：入住时间压力（非几何走廊） */
  | 'BOOKING_CHECKIN_PRESSURE';

export interface UnifiedConstraintEdge {
  id: string;
  domain: ConstraintDomain;
  /** 拓扑类来自 constraint-edge；DRIFT_SOURCE_LINK 连接槽位 → 其发出的 drift 节点 */
  topologyKind: UnifiedTopologyEdgeKind;
  fromNodeId: string;
  toNodeId: string;
  /** 兼容旧边字段（同日排序边时的日历日）；跨日 handoff 两端可能属不同日 */
  date?: string;
}

/**
 * 单次引擎 pass 的约束图视图（可持久化 / 与 plan.temporal 并列）
 */
export interface UnifiedConstraintGraphSnapshot {
  version: '1';
  emittedAt: string;
  nodes: UnifiedConstraintNode[];
  edges: UnifiedConstraintEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    driftNodeCount: number;
    slotNodeCount: number;
    bookingDeadlineNodeCount: number;
    /** 按节点 domain 计数（仅出现过的域有键） */
    domainNodeCounts: Partial<Record<ConstraintDomain, number>>;
    /** 按边 domain 计数 */
    domainEdgeCounts: Partial<Record<ConstraintDomain, number>>;
  };
}
