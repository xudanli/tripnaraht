/**
 * Canonical JSON shape for SpatialDomainSegment.latest_status (Road.is / mock sync).
 * Consumed by SegmentFeasibilityUtil + PhysicalValidator; written by EnvSyncWorker.
 */

export const ROAD_SURFACE_CONDITIONS = ['OPEN', 'CLOSED', 'SLIPPERY', 'HEAVY_SNOW', 'UNKNOWN'] as const;

export type RoadSurfaceCondition = (typeof ROAD_SURFACE_CONDITIONS)[number];

/**
 * 路网准入语义（Road.is / Vegagerðin 聚合层；比 surface condition 更贴近「世界约束」）。
 * 与路况字符串并存：`condition` 保留供应商原始枚举，`accessState` 由上游写入或从 condition 推断。
 */
export const ROAD_ACCESS_STATES = [
  'OPEN',
  'RESTRICTED_4WD',
  'IMPASSABLE',
  'SEASONAL_CLOSED',
  'FLOOD_RISK',
] as const;

export type RoadAccessState = (typeof ROAD_ACCESS_STATES)[number];

/** 与 TravelHazard VehicleClass 对齐；用于准入与传播（Segment 可行性仍用三档 vehicleType）。 */
export interface RoadVehicleRequirements {
  minVehicleClass?: 'SEDAN' | 'SUV_4WD' | 'CAMPERVAN' | 'EV_CAMPERVAN';
  required4x4?: boolean;
  riverCrossing?: boolean;
}

/** Persisted column latest_status + provider.fetchCondition return value (subset). */
export interface SegmentLatestRoadStatusV1 {
  condition: RoadSurfaceCondition;
  /** 结构化准入态；优先于从 `condition` 推断 */
  accessState?: RoadAccessState;
  vehicleRequirements?: RoadVehicleRequirements;
  /** Human-readable status from road.is or mock */
  condition_text?: string;
  evidence_source?: string;
  source_url?: string;
  /** ISO time when upstream reported the condition */
  observed_at?: string;
  /** ISO time when we wrote this row */
  synced_at?: string;
  provider?: 'road.is' | 'mock';
  /** Optional raw vendor payload for audits */
  raw?: unknown;
}

export function parseRoadSurfaceCondition(value: unknown): RoadSurfaceCondition {
  const u = String(value ?? '')
    .trim()
    .toUpperCase();
  if (u === 'OPEN') return 'OPEN';
  if (u === 'CLOSED') return 'CLOSED';
  if (u === 'SLIPPERY') return 'SLIPPERY';
  if (u === 'HEAVY_SNOW' || u === 'HEAVY SNOW') return 'HEAVY_SNOW';
  return 'UNKNOWN';
}

/** 供 Segment 可行性使用：与 road_condition / seasonal 并列的「实况」车辆档位 */
export type SegmentFeasibilityVehicleType = 'SEDAN' | 'SUV' | 'FOUR_BY_FOUR';

/**
 * 由 Road.is `RoadSurfaceCondition` 推导准入态（未写入 accessState 时的默认映射）。
 * SLIPPERY → RESTRICTED_4WD（不再等同于「仅提醒」）。
 */
export function inferRoadAccessFromSurfaceCondition(
  c: RoadSurfaceCondition,
): RoadAccessState {
  switch (c) {
    case 'OPEN':
      return 'OPEN';
    case 'SLIPPERY':
      return 'RESTRICTED_4WD';
    case 'CLOSED':
      return 'IMPASSABLE';
    case 'HEAVY_SNOW':
      return 'IMPASSABLE';
    case 'UNKNOWN':
    default:
      return 'OPEN';
  }
}

export function parseRoadAccessState(value: unknown): RoadAccessState | undefined {
  const u = String(value ?? '')
    .trim()
    .toUpperCase();
  if ((ROAD_ACCESS_STATES as readonly string[]).includes(u)) {
    return u as RoadAccessState;
  }
  return undefined;
}

/**
 * 实况路况是否阻断该路段通行（含 RESTRICTED_4WD × 车型）。
 * 优先 `accessState`；否则由 `condition` 推断。
 */
export function liveLatestStatusBlocksSegment(
  ls: SegmentLatestRoadStatusV1 | undefined,
  vehicleType?: SegmentFeasibilityVehicleType,
): boolean {
  if (!ls) return false;
  const access =
    ls.accessState ??
    inferRoadAccessFromSurfaceCondition(parseRoadSurfaceCondition(ls.condition));
  if (access === 'OPEN') return false;
  if (
    access === 'IMPASSABLE' ||
    access === 'SEASONAL_CLOSED' ||
    access === 'FLOOD_RISK'
  ) {
    return true;
  }
  if (access === 'RESTRICTED_4WD') {
    return vehicleType !== 'FOUR_BY_FOUR';
  }
  return false;
}

/** True when live road data should BLOCK traversal (union with static seasonal rules). */
export function roadSurfaceConditionIsBlocking(c: RoadSurfaceCondition): boolean {
  return c === 'CLOSED' || c === 'HEAVY_SNOW';
}
