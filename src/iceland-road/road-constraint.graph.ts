/**
 * Execution dependency graph：路网 → POI 可达性（非可视化 GIS）
 */

import type { RoadAccessState } from '../domain/ontology/validator/road-status-contract.types';
import {
  ICELAND_ROAD_POI_BINDINGS_MVP,
  type RoadPOIBinding,
} from './road-poi.binding';

/** 与路况侧 VehicleClass 区分：路网准入三档 MVP */
export type RoadVehicleTier = 'CAR' | 'SUV' | '4WD';

export interface RoadConstraintVehicleConstraint {
  readonly minVehicleClass?: RoadVehicleTier;
  readonly riverCrossing?: boolean;
}

export interface RoadConstraintNode {
  readonly roadId: string;
  readonly name?: string;
  /** 模板态；实况以 RoadConstraintEvent.status 为准 */
  status: RoadAccessState;
  readonly vehicleConstraint?: RoadConstraintVehicleConstraint;
  /** 该路段直接服务的 POI */
  connectedPOIs: string[];
  /** 反向依赖（MVP 常与 connectedPOIs 相同；可扩展层级传播） */
  dependentPOIs: string[];
  readonly severityWeight?: number;
}

export interface RoadConstraintGraph {
  readonly nodes: Map<string, RoadConstraintNode>;
  /** POI → 必经路段 id 列表（用于反向查询） */
  readonly poiIndex: Map<string, string[]>;
}

export function normalizeRoadId(roadId: string): string {
  return String(roadId ?? '')
    .trim()
    .toUpperCase();
}

/**
 * 由绑定表构造执行依赖图（内存 Map；运行时勿 JSON 序列化整图）。
 */
export function buildRoadConstraintGraph(
  bindings: readonly RoadPOIBinding[],
  options?: { readonly defaultStatus?: RoadAccessState },
): RoadConstraintGraph {
  const nodes = new Map<string, RoadConstraintNode>();
  const poiIndex = new Map<string, string[]>();
  const defaultStatus = options?.defaultStatus ?? 'OPEN';

  for (const b of bindings) {
    const id = normalizeRoadId(b.roadId);
    const pois = [...b.poiIds];
    const prev = nodes.get(id);
    if (prev) {
      const merged = new Set([...prev.connectedPOIs, ...pois]);
      prev.connectedPOIs = [...merged];
      prev.dependentPOIs = [...merged];
    } else {
      nodes.set(id, {
        roadId: id,
        status: defaultStatus,
        connectedPOIs: pois,
        dependentPOIs: [...pois],
      });
    }
    for (const p of pois) {
      const roads = poiIndex.get(p) ?? [];
      if (!roads.includes(id)) {
        roads.push(id);
      }
      poiIndex.set(p, roads);
    }
  }

  return { nodes, poiIndex };
}

/** 默认冰岛 MVP 图（绑定表 → Map）；只读缓存避免重复分配 */
let defaultIcelandGraph: RoadConstraintGraph | undefined;

export function getDefaultIcelandRoadConstraintGraph(): RoadConstraintGraph {
  if (!defaultIcelandGraph) {
    defaultIcelandGraph = buildRoadConstraintGraph(ICELAND_ROAD_POI_BINDINGS_MVP);
  }
  return defaultIcelandGraph;
}
