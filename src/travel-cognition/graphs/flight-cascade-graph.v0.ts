/**
 * 航班延误级联依赖图 v0 — 非交易型影响传播模板。
 *
 * 链：FLIGHT_STATUS → 接驳(TRANSPORT_TIME) → 入住(HOTEL_AREA) → 当日路线(DAY)
 */

import type { TravelDependencyGraph } from '../types/dependency-graph.types';
import type { TravelEntityKind } from '../types/travel-entity-ref.types';
import type { TravelFactType } from '../types/evidence-envelope.types';

export const FLIGHT_CASCADE_GRAPH_VERSION = 'travel-cognition/flight-cascade/v0' as const;

export type FlightCascadeRelationId =
  | 'flight_delay_cascades_to_transfer'
  | 'transfer_delay_cascades_to_check_in'
  | 'check_in_delay_cascades_to_day_plan';

export interface FlightCascadeRelationTemplate {
  relation: FlightCascadeRelationId;
  triggerFactType: TravelFactType;
  sourceKind: TravelEntityKind;
  targetKind: TravelEntityKind;
}

/** 有序级联关系（实例化时按行程链节点填充 entityRef） */
export const FLIGHT_CASCADE_RELATIONS_V0: readonly FlightCascadeRelationTemplate[] = [
  {
    relation: 'flight_delay_cascades_to_transfer',
    triggerFactType: 'FLIGHT_STATUS',
    sourceKind: 'AIRPORT',
    targetKind: 'SEGMENT',
  },
  {
    relation: 'transfer_delay_cascades_to_check_in',
    triggerFactType: 'TRANSPORT_TIME',
    sourceKind: 'SEGMENT',
    targetKind: 'HOTEL_AREA',
  },
  {
    relation: 'check_in_delay_cascades_to_day_plan',
    triggerFactType: 'OPENING_HOURS',
    sourceKind: 'HOTEL_AREA',
    targetKind: 'DAY',
  },
] as const;

/** 占位图（边在 analyze 时按具体行程实例化） */
export const FLIGHT_CASCADE_DEPENDENCY_GRAPH_V0: TravelDependencyGraph = {
  version: FLIGHT_CASCADE_GRAPH_VERSION,
  edges: [],
};

/** 默认地面接驳缓冲（分钟） */
export const DEFAULT_DEBARK_BUFFER_MINUTES = 30;
export const DEFAULT_TRANSFER_SLACK_MINUTES = 15;
