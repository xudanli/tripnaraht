/**
 * Intent Profile Registry — 声明式用户意图配置（路由 + RAG + geo 检索）。
 */

export type IntentRouteKind =
  | 'DATA_LOOKUP'
  | 'CRUD_SHORT_CIRCUIT'
  | 'SKU_SHORT_CIRCUIT'
  | 'TRIP_PLANNING';

export type IntentProfileId =
  | 'consult.dining'
  | 'consult.supply'
  | 'consult.supply.nearby'
  | 'consult.accommodation'
  | 'consult.transport'
  | 'consult.scoped_feasibility'
  | 'consult.itinerary.day_view'
  | 'crud.itinerary.add'
  | 'crud.itinerary.delete'
  | 'crud.itinerary.update';

export interface IntentMatchContext {
  tripId?: string | null;
  countryCode?: string | null;
}

export interface IntentProfile {
  id: IntentProfileId;
  /** 展示用标签 */
  label: string;
  /** 命中后建议的路由档位（入口层 / 短路层参考） */
  route: IntentRouteKind;
  /** 可选：RAG chunk 类别提示 */
  ragChunkCategories?: string[];
  /** 可选：geo.findNearbyPOI 类别 */
  geoCategories?: Array<'RESTAURANT' | 'SHOPPING' | 'HOTEL' | 'NATURE' | 'VIEWPOINT' | 'HISTORIC_SITE'>;
  /** 可选：国家白名单；缺省表示全量 */
  countries?: string[];
  match: (message: string, ctx: IntentMatchContext) => boolean;
}

export interface MatchedIntentProfile {
  profile: IntentProfile;
  /** 若为复合句拆分后的子句，否则为全文 */
  clause: string;
}
