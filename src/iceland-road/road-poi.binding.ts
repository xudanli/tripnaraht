/**
 * 冰岛：路段 ↔ POI 可达性绑定（MVP）
 * 后续可换源为 DB / readiness pack 生成，接口保持稳定。
 */

export interface RoadPOIBinding {
  readonly roadId: string;
  readonly poiIds: readonly string[];
}

/** MVP 种子：stable POI key，可与 readiness / 产品 ID 对齐 */
export const ICELAND_ROAD_POI_BINDINGS_MVP: readonly RoadPOIBinding[] = [
  { roadId: 'F208', poiIds: ['LANDMANNALAUGAR', 'LANDMANNALAUGAR_HUTS'] },
  { roadId: 'F26', poiIds: ['SPRENGISANDUR_ROUTE', 'NYDALUR'] },
  { roadId: 'F35', poiIds: ['KJOLUR_ROUTE', 'KERLINGARFJOLL', 'HVERAVELLIR'] },
];
