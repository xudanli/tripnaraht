/**
 * 冰岛核心场景级联依赖图 v0 — 封路 / F-road / 天气窗口。
 *
 * 链（封路）：ROAD → DRIVE → POI → DAY
 * 链（天气）：WEATHER → POI(outdoor) → DAY
 */

import type { TravelDependencyGraph } from '../types/dependency-graph.types';
import type { TravelEntityKind } from '../types/travel-entity-ref.types';
import type { TravelFactType } from '../types/evidence-envelope.types';

export const ICELAND_ROAD_CASCADE_GRAPH_VERSION = 'travel-cognition/iceland-road-cascade/v0' as const;
export const ICELAND_WEATHER_CASCADE_GRAPH_VERSION = 'travel-cognition/iceland-weather-cascade/v0' as const;

export type IcelandRoadCascadeRelationId =
  | 'road_closure_blocks_drive'
  | 'drive_blocked_cascades_to_poi'
  | 'poi_blocked_cascades_to_day';

export type IcelandWeatherCascadeRelationId =
  | 'weather_window_blocks_outdoor_poi'
  | 'outdoor_poi_blocked_cascades_to_day';

export interface IcelandCascadeRelationTemplate {
  relation: string;
  triggerFactType: TravelFactType;
  sourceKind: TravelEntityKind;
  targetKind: TravelEntityKind;
}

export const ICELAND_ROAD_CASCADE_RELATIONS_V0: readonly IcelandCascadeRelationTemplate[] = [
  {
    relation: 'road_closure_blocks_drive',
    triggerFactType: 'ROAD',
    sourceKind: 'ROAD',
    targetKind: 'SEGMENT',
  },
  {
    relation: 'drive_blocked_cascades_to_poi',
    triggerFactType: 'ROAD',
    sourceKind: 'SEGMENT',
    targetKind: 'POI',
  },
  {
    relation: 'poi_blocked_cascades_to_day',
    triggerFactType: 'ROAD',
    sourceKind: 'POI',
    targetKind: 'DAY',
  },
] as const;

export const ICELAND_WEATHER_CASCADE_RELATIONS_V0: readonly IcelandCascadeRelationTemplate[] = [
  {
    relation: 'weather_window_blocks_outdoor_poi',
    triggerFactType: 'WEATHER',
    sourceKind: 'REGION',
    targetKind: 'POI',
  },
  {
    relation: 'outdoor_poi_blocked_cascades_to_day',
    triggerFactType: 'WEATHER',
    sourceKind: 'POI',
    targetKind: 'DAY',
  },
] as const;

export const ICELAND_ROAD_DEPENDENCY_GRAPH_V0: TravelDependencyGraph = {
  version: ICELAND_ROAD_CASCADE_GRAPH_VERSION,
  edges: [],
};

export const ICELAND_WEATHER_DEPENDENCY_GRAPH_V0: TravelDependencyGraph = {
  version: ICELAND_WEATHER_CASCADE_GRAPH_VERSION,
  edges: [],
};

/** F-road 封路在 ROAD 链上叠加更高严重度（仍用 ROAD factType） */
export const ICELAND_FROAD_CASCADE_GRAPH_VERSION = 'travel-cognition/iceland-froad-cascade/v0' as const;
