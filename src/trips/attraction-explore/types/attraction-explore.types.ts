export type AttractionExplorePriority = 'must_go' | 'very_interested' | 'alternative';

export type AttractionExploreViewTab = 'recommended' | 'map' | 'along_route';

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
  destination: string;
  themes: Array<{ id: string; label: string }>;
  suitabilities: Array<{ id: string; label: string }>;
  selectedFilters: AttractionExploreFilters;
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
  nameEN?: string | null;
  category: string;
  region?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  badge?: string | null;
  meta: AttractionExplorePlaceMeta;
  recommendationReasons?: string[];
  score?: number;
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
  kind: 'candidate' | 'recommendation' | 'route';
  priority?: AttractionExplorePriority;
  highlighted?: boolean;
  insertHint?: {
    suggestedDayIndex?: number;
    detourMinutes?: number;
    detourMethod?: string;
    startTime?: string;
  };
}

export interface AttractionExploreMapView {
  tripId: string;
  routePolyline?: Array<{ lat: number; lng: number }> | string | null;
  pois: AttractionExploreMapPoi[];
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
  seededFrom?: string;
  suggestAttractionExplore?: boolean;
}
