export type GlobalConflictType = 'POI_OVERLOAD' | 'AREA_HOTSPOT' | 'WEATHER_GLOBAL' | 'TRANSPORT_SYSTEM';

export interface GlobalConflict {
  type: GlobalConflictType;
  tripIds: string[];
  detail: string;
  /** 可选结构化线索（审计 / World Orchestrator） */
  meta?: Record<string, unknown>;
}

export interface TripOccupancyRef {
  tripId: string;
  /** YYYY-MM-DD 或 day 序号，由调用方约定一致 */
  dayKey: string;
  slot: string;
  placeId: number;
  /** 可选：用于同城同时段多行程叠加检测 */
  cityKey?: string;
}
