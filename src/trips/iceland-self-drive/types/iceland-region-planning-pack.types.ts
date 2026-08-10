/**
 * Iceland Region Planning Pack — Golden Set / coverage semantics.
 *
 * Layers (do not collapse into a single "role"):
 * - entityType: what the catalog row is
 * - coverageRole: PRIMARY | SECONDARY | SUPPORT for regional coverage
 * - routeRole: gateways / overnight / supply / weather fallback
 * - relations: CO_VISIT / SOFT_ALTERNATIVE / PARENT_CHILD / ALIAS_OF
 *
 * Experience products are never the same id as a Place.
 */

export type IcelandRegionPackStatus = 'ACTIVE' | 'DRAFT';

export type IcelandRegionCoverageStatus =
  | 'ATTRACTION_READY'
  | 'CORRIDOR_ONLY'
  | 'EXPERIMENTAL';

export type IcelandRegionEntityType =
  | 'ATTRACTION'
  | 'ATTRACTION_AREA'
  | 'TOWN_HUB'
  | 'LODGING'
  | 'SERVICE'
  | 'EXPERIENCE_PRODUCT'
  | 'ROUTE_ANCHOR'
  | 'CORRIDOR';

export type IcelandRegionCoverageRole = 'PRIMARY' | 'SECONDARY' | 'SUPPORT';

export type IcelandRegionRouteRole =
  | 'ENTRY_GATEWAY'
  | 'EXIT_GATEWAY'
  | 'OVERNIGHT_HUB'
  | 'SUPPLY_HUB'
  | 'MEAL_HUB'
  | 'REST_STOP'
  | 'WEATHER_FALLBACK_HUB'
  | 'ORIGIN_BASE'
  | 'KIRKJUFELL_GATEWAY';

export type IcelandRegionRelationType =
  | 'CO_VISIT_CLUSTER'
  | 'SOFT_ALTERNATIVE'
  | 'HARD_EXCLUSIVE'
  | 'PARENT_CHILD'
  | 'ALIAS_OF';

export interface IcelandRegionEntityRef {
  /** Catalog Place.id when entity is place-backed */
  placeId?: number;
  /** Stable product id when entity is a bookable experience (never reuse placeId) */
  experienceProductId?: string;
  label: string;
  entityType: IcelandRegionEntityType;
  /** Display / catalog name hint (e.g. Geysir Geothermal Area) */
  displayName?: string;
  /** When this row is an alias, points at the canonical placeId */
  canonicalPlaceId?: number;
  aliasPlaceIds?: number[];
  parentPlaceId?: number;
  coverageRole?: IcelandRegionCoverageRole;
  routeRoles?: IcelandRegionRouteRole[];
  typicalVisitMinutes?: number;
  representativenessScore?: number;
  seasonalAvailability?: string[];
  vehicleConstraints?: string[];
  suitableTripStyles?: string[];
  /** Meeting point for experience products */
  meetingPlaceId?: number;
  regionAnchorPlaceId?: number;
  bookingRequired?: boolean;
  durationMinutes?: number;
  notes?: string;
}

export interface IcelandRegionRelation {
  groupId: string;
  relationType: IcelandRegionRelationType;
  /** Member placeIds (canonical only) */
  memberPlaceIds: number[];
  /** For PARENT_CHILD: parent first */
  notes?: string;
}

export interface IcelandRegionSubregion {
  subregionId: string;
  displayName: string;
  /** Entities that belong to this route subregion for day-planning */
  entityPlaceIds: number[];
  directionHints?: string[];
  minRecommendedDays?: number;
  idealRecommendedDays?: number;
  involvesFRoad?: boolean;
  notes?: string;
}

export interface IcelandRegionPlanningPolicy {
  minRecommendedDays?: number;
  idealRecommendedDays?: number;
  directionHints?: string[];
  maxCoreAnchorsPerDay?: number;
  seasonalBufferMinutes?: number;
  involvesFRoad?: boolean;
  /** Prefer generating within one subregion per day when set */
  requireSubregionDayScope?: boolean;
}

export interface IcelandRegionPlanningPack {
  packId: string;
  wizardRegionIds: string[];
  version: string;
  status: IcelandRegionPackStatus;
  /** Attraction golden-set readiness for coverage QA */
  coverageStatus: IcelandRegionCoverageStatus;
  regionalGoldenSetReady: boolean;
  displayName: string;
  entities: IcelandRegionEntityRef[];
  relations: IcelandRegionRelation[];
  subregions?: IcelandRegionSubregion[];
  planningPolicy: IcelandRegionPlanningPolicy;
  sourceRefs: string[];
  notes?: string[];
}

/** Wizard catalog supportLevel aligned with pack readiness */
export type IcelandSelfDriveRegionSupportLevel =
  | 'full'
  | 'partial'
  | 'corridor_only'
  | 'experimental'
  | 'corridor';

export type IcelandRegionCoverageExcludeReason =
  | 'INSUFFICIENT_DAYS'
  | 'REGION_PACK_MISSING'
  | 'REGION_CORE_CANDIDATES_EMPTY'
  | 'REGION_SEASONALLY_UNAVAILABLE'
  | 'REGION_VEHICLE_INCOMPATIBLE'
  | 'NO_SCHEDULED_COVERAGE';

export interface IcelandRegionCoveragePlaceHit {
  regionId: string;
  packId: string;
  scheduledPlaceIds: number[];
}

export interface IcelandRegionCoverageExcluded {
  regionId: string;
  reason: IcelandRegionCoverageExcludeReason;
  message?: string;
}

/** Returned on initialPlan / bootstrap */
export interface IcelandSelfDriveRegionCoverage {
  requested: string[];
  covered: IcelandRegionCoveragePlaceHit[];
  excluded: IcelandRegionCoverageExcluded[];
  /** Packs loaded for this create (incl. arrival soft-include) */
  activePackIds: string[];
}
