/**
 * 统一多模态地图图层（tripnara.unified_map_layer@v1）
 *
 * 取车 / 还车 / 转场 / 每日酒店 Depot 锚点 + 行程 POI 的全要素图层。
 */

export const UNIFIED_MAP_LAYER_SCHEMA = 'tripnara.unified_map_layer@v1' as const;

export type UnifiedMapPointKind =
  | 'poi'
  | 'hotel_depot'
  | 'car_pickup'
  | 'car_dropoff'
  | 'transfer'
  | 'day_start';

export type UnifiedMapLegKind = 'drive' | 'walk' | 'transit' | 'flight' | 'ferry';

export interface UnifiedMapLayerPoint {
  id: string;
  kind: UnifiedMapPointKind;
  label_zh: string;
  lat: number;
  lng: number;
  day_number?: number;
  night_index?: number;
  icon_hint?: string;
}

export interface UnifiedMapLayerLeg {
  id: string;
  kind: UnifiedMapLegKind;
  from_point_id: string;
  to_point_id: string;
  label_zh?: string;
}

export interface UnifiedMapLayerPayload {
  schema: typeof UNIFIED_MAP_LAYER_SCHEMA;
  trip_id?: string;
  points: UnifiedMapLayerPoint[];
  legs: UnifiedMapLayerLeg[];
  overview_directions_url?: string;
  computed_at: string;
}
