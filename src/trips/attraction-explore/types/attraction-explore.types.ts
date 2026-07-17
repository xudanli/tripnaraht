export type AttractionExplorePriority = 'must_go' | 'very_interested' | 'alternative';

export type AttractionExploreViewTab = 'recommended' | 'map' | 'along_route';

export type AttractionExploreSortId = 'smart' | 'distance' | 'match' | 'open_now';

export type AttractionExploreQuickFilterId =
  | 'nearby'
  | 'indoor'
  | 'supply'
  | 'easy'
  | 'team';

export type AttractionExploreOpenStatus = 'open' | 'closed' | 'unknown';

export type AttractionExplorePrimaryAction = 'add_to_day' | 'add';

export type { AttractionExploreCompiledIntent } from '../utils/attraction-explore-intent-compiler.util';

export type AttractionExploreCandidateSource =
  | 'manual'
  | 'guide_accept'
  | 'route_seed'
  | 'search'
  | 'ai_consult';

export interface AttractionExploreFilters {
  themeIds: string[];
  suitabilityIds: string[];
  viewTab: AttractionExploreViewTab;
  /** 快捷 Chip：nearby | indoor | supply | easy | team */
  quickFilterIds?: string[];
  /** smart | distance | match | open_now */
  sort?: AttractionExploreSortId;
}

export interface AttractionExploreQuickFilterChip {
  id: string;
  label: string;
  icon?: string;
  selected: boolean;
}

export interface AttractionExploreSortOption {
  id: string;
  label: string;
}

export interface AttractionExploreTravelConditions {
  origin?: string | null;
  transportMode?: string | null;
  pace?: string | null;
  weatherHint?: string | null;
}

export interface AttractionExploreMemberPreferenceSummary {
  memberCount: number;
  topThemes: string[];
  topSuitabilities: string[];
}

export interface AttractionExploreContextView {
  tripId: string;
  /** 1-based；添加活动页必传 dayIndex 时回显 */
  dayIndex?: number;
  dayLabel?: string;
  subtitle?: string;
  destination: string;
  /** 设计稿横滑 Chips */
  quickFilters: AttractionExploreQuickFilterChip[];
  themes: Array<{ id: string; label: string }>;
  suitabilities: Array<{ id: string; label: string }>;
  selectedFilters: AttractionExploreFilters;
  sortOptions: AttractionExploreSortOption[];
  travelConditions: AttractionExploreTravelConditions;
  memberPreferences: AttractionExploreMemberPreferenceSummary;
}

export interface AttractionExplorePlaceMeta {
  suggestedDwellMinutes?: number;
  detourMinutes?: number;
  physicalLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresReservation?: boolean;
  distanceFromRouteKm?: number;
}

export interface AttractionExploreRecommendationItem {
  /** 与 placeId 相同，便于前端卡片组件复用 */
  id: number;
  placeId: number;
  attractionId?: string;
  name: string;
  /** iOS 卡片标题别名（= name） */
  title?: string;
  nameEN?: string | null;
  category: string;
  region?: string | null;
  description?: string | null;
  /** iOS 摘要别名（= description） */
  summary?: string | null;
  imageUrl?: string | null;
  badge?: string | null;
  isAiRecommended?: boolean;
  openStatus?: AttractionExploreOpenStatus;
  /** 「驾车 12 分钟 · 距离 8.6 km」 */
  travelInfo?: string;
  driveMinutes?: number;
  distanceKm?: number;
  tags?: string[];
  /** 团队匹配 0–100 */
  matchPercent?: number;
  meta: AttractionExplorePlaceMeta;
  recommendationReasons?: string[];
  score?: number;
  /** 已在本行程 Active Plan（任意日）出现 */
  alreadyInItinerary?: boolean;
  /** 已在请求 dayIndex 当日出现（通常会被过滤，保留字段便于兼容） */
  alreadyInDay?: boolean;
  /** 大按钮「加入今天」vs 「+」 */
  primaryAction?: AttractionExplorePrimaryAction;
}

export interface AttractionExploreRecommendationGroup {
  groupId: string;
  title: string;
  subtitle?: string;
  items: AttractionExploreRecommendationItem[];
  /** 与 items 相同，兼容部分前端命名 */
  attractions?: AttractionExploreRecommendationItem[];
}

export interface AttractionExploreRecommendationsView {
  tripId: string;
  viewTab: AttractionExploreViewTab;
  /** 1-based；请求带 dayIndex 时回显 */
  dayIndex?: number;
  /** 绿条场景提示（天气/风况等） */
  contextTip?: string;
  /** 兼容旧字段；可与 contextTip 并存 */
  aiTip?: string;
  /** 扁平列表（添加活动页主列表）；groups 仍保留兼容 Web */
  items?: AttractionExploreRecommendationItem[];
  groups: AttractionExploreRecommendationGroup[];
}

import type {
  AttractionExploreCompiledIntent,
} from '../utils/attraction-explore-intent-compiler.util';

export interface AttractionExploreSearchView extends AttractionExploreRecommendationsView {
  compiledIntent: AttractionExploreCompiledIntent;
}

export interface AttractionExploreCandidateView {
  id: string;
  placeId: number;
  attractionId?: string;
  name: string;
  nameEN?: string | null;
  category: string;
  region?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  priority: AttractionExplorePriority;
  sortOrder: number;
  source: AttractionExploreCandidateSource;
  meta: AttractionExplorePlaceMeta;
}

export interface AttractionExploreCandidatesSummary {
  attractionCount: number;
  estimatedDays: number;
  routeSpanKm?: number | null;
}

export interface AttractionExploreCandidatesView {
  tripId: string;
  candidates: AttractionExploreCandidateView[];
  summary: AttractionExploreCandidatesSummary;
}

export interface AttractionExploreMapPoi {
  id: string;
  placeId: number;
  name: string;
  coordinates: { lat: number; lng: number };
  kind: 'candidate' | 'recommendation' | 'route' | 'lodging' | 'lodging_suggestion';
  priority?: AttractionExplorePriority;
  highlighted?: boolean;
  lodgingNightIndex?: number;
  lodgingDayIndex?: number;
  insertHint?: {
    suggestedDayIndex?: number;
    detourMinutes?: number;
    detourMethod?: string;
    startTime?: string;
  };
}

export interface PlanningLodgingLegEndpoint {
  lat: number;
  lng: number;
  placeId?: number;
  label?: string;
  kind: 'day_anchor' | 'lodging' | 'suggested_lodging';
}

export interface PlanningLodgingLeg {
  id: string;
  nightIndex: number;
  dayIndex: number;
  from: PlanningLodgingLegEndpoint;
  to: PlanningLodgingLegEndpoint;
  distanceKm?: number;
  driveMinutesEstimate?: number;
  kind: 'approach' | 'relocation';
  highlighted?: boolean;
}

export interface PlanningLodgingSuggestion {
  id: string;
  nightIndex: number;
  dayIndex: number;
  placeId: number;
  name: string;
  nameEN?: string | null;
  kind: 'current' | 'alternative' | 'recommended';
  priority: 'primary' | 'alternative' | 'recommended';
  coordinates?: { lat: number; lng: number };
  rating?: number | null;
  priceHint?: string | null;
  region?: string | null;
  reason?: string;
  itineraryItemId?: string;
  highlighted?: boolean;
  meta?: {
    distanceFromAnchorKm?: number;
    anchorPlaceName?: string;
    driveMinutesEstimate?: number;
  };
}

export interface AttractionExploreMapView {
  tripId: string;
  routePolyline?: Array<{ lat: number; lng: number }> | string | null;
  pois: AttractionExploreMapPoi[];
  lodgingLegs?: PlanningLodgingLeg[];
  bounds?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  } | null;
}

export interface AttractionExploreAutoArrangeResult {
  taskId: string;
  status: 'completed' | 'queued';
  itemCount?: number;
}

export interface AttractionExploreAiConsultResult {
  answer: string;
  suggestedActions?: Array<{
    action: 'add_candidate' | 'remove_candidate' | 'change_priority';
    placeId?: number;
    candidateId?: string;
    priority?: AttractionExplorePriority;
    label: string;
  }>;
}

export interface AttractionExploreTripMetadataSlice {
  themeIds?: string[];
  suitabilityIds?: string[];
  viewTab?: AttractionExploreViewTab;
  quickFilterIds?: string[];
  sort?: AttractionExploreSortId;
  seededFrom?: string;
  suggestAttractionExplore?: boolean;
}
