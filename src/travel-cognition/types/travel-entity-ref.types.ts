/**
 * TravelEntityRef — 统一旅行实体引用，消除同名地点/机场/酒店/道路的歧义。
 *
 * TripNARA 产品边界：决策与路线认知，不进入交易履约。
 * 实体层只描述「世界里的什么」，不描述 Offer/Order/库存。
 */

/** 实体种类（TravelEntityGraph 节点类型） */
export type TravelEntityKind =
  | 'POI'
  | 'AIRPORT'
  | 'HOTEL_AREA'
  | 'STATION'
  | 'ROAD'
  | 'REGION'
  | 'SEGMENT'
  | 'DAY';

/** 外部 ID 命名空间（可扩展 GERS 等） */
export type TravelEntityExternalNamespace =
  | 'google_place_id'
  | 'osm'
  | 'iata'
  | 'icao'
  | 'gers'
  | 'internal';

export interface TravelEntityExternalId {
  namespace: TravelEntityExternalIdNamespace;
  value: string;
}

/** @deprecated alias — prefer TravelEntityExternalNamespace */
export type TravelEntityExternalIdNamespace = TravelEntityExternalNamespace;

/**
 * 统一实体引用。
 * `id` 为 TripNARA 内部稳定 ID；`externalIds` 用于跨源对齐。
 */
export interface TravelEntityRef {
  kind: TravelEntityKind;
  /** TripNARA 内部 ID（Place.id、road segment key 等） */
  id: string;
  /** 人类可读标签（展示/消歧，非主键） */
  label?: string;
  externalIds?: TravelEntityExternalId[];
}

/** 从 Place 行构建 POI 引用 */
export function travelEntityRefFromPlace(input: {
  id: number | string;
  name?: string | null;
  googlePlaceId?: string | null;
}): TravelEntityRef {
  const ref: TravelEntityRef = {
    kind: 'POI',
    id: String(input.id),
    label: input.name ?? undefined,
  };
  if (input.googlePlaceId) {
    ref.externalIds = [{ namespace: 'google_place_id', value: input.googlePlaceId }];
  }
  return ref;
}

/** 与决策内核 ConstraintEntityRef 的轻量互转（渐进迁移） */
export function toConstraintEntityRef(
  ref: TravelEntityRef,
): { type: 'POI' | 'DAY' | 'SEGMENT' | 'BUDGET' | 'DESTINATION' | 'OTHER'; id?: string } {
  const kindMap: Record<
    TravelEntityKind,
    'POI' | 'DAY' | 'SEGMENT' | 'BUDGET' | 'DESTINATION' | 'OTHER'
  > = {
    POI: 'POI',
    AIRPORT: 'POI',
    HOTEL_AREA: 'POI',
    STATION: 'POI',
    ROAD: 'SEGMENT',
    REGION: 'DESTINATION',
    SEGMENT: 'SEGMENT',
    DAY: 'DAY',
  };
  return { type: kindMap[ref.kind] ?? 'OTHER', id: ref.id };
}
