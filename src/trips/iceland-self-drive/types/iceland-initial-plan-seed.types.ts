/**
 * Initial Plan seed contracts — Golden Set → candidates (never PlanVersion).
 */

import type {
  IcelandRegionCoverageRole,
  IcelandRegionEntityType,
  IcelandRegionRelationType,
} from './iceland-region-planning-pack.types';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface PlaceRef {
  placeId?: number;
  label?: string;
  /** Overnight / check-in date YYYY-MM-DD when known (confirmed lodging) */
  nightDate?: string;
  /** How the overnight was chosen — UI may label soft vs booked */
  source?: 'CONFIRMED_BOOKING' | 'GOLDEN_SET_SOFT';
}

export interface VehicleProfile {
  is4wd?: boolean;
  vehicleClass?: string;
  allowsFRoad?: boolean;
  allowsRiverCrossing?: boolean;
}

export interface TripPreferenceProfile {
  /** placeIds user explicitly wants */
  mustIncludePlaceIds?: number[];
  /** placeIds user explicitly excludes */
  excludePlaceIds?: number[];
  interestTags?: string[];
  pace?: 'relaxed' | 'standard' | 'intensive';
}

export interface InitialPlanSeedInput {
  tripId: string;
  travelDates: DateRange;
  /** Wizard regionIds (snake_case) */
  regionIds: string[];
  originGateway?: PlaceRef;
  exitGateway?: PlaceRef;
  confirmedLodgings?: PlaceRef[];
  vehicleProfile?: VehicleProfile;
  requestedPlaces?: PlaceRef[];
  preferences?: TripPreferenceProfile;
  dailyDrivingLimitMin?: number;
  /** Override season for tests: summer | winter | shoulder */
  seasonOverride?: string;
}

export interface RegionSelection {
  regionId: string;
  packIds: string[];
  coverageStatus: string;
  regionalGoldenSetReady: boolean;
  subregionIds: string[];
  selectedBecause: string[];
}

export type SeedCandidateKind =
  | 'ATTRACTION'
  | 'ATTRACTION_AREA'
  | 'TOWN_HUB'
  | 'LODGING'
  | 'SERVICE'
  | 'ROUTE_ANCHOR';

export interface SeedCandidate {
  candidateId: string;
  canonicalPlaceId: number;
  label: string;
  entityType: IcelandRegionEntityType;
  kind: SeedCandidateKind;
  regionId: string;
  packId: string;
  subregionId?: string;
  coverageRole?: IcelandRegionCoverageRole;
  /** Hubs/gateways: participate in routing but NOT attraction coverage */
  countsTowardAttractionCoverage: boolean;
  score: number;
  scoreBreakdown: Record<string, number>;
  relationGroupIds: string[];
  parentCanonicalPlaceId?: number;
  selectedBecause: string[];
  gateOutcome: GateOutcome;
}

export type ExperienceDiscoveryStatus =
  | 'DISCOVERED'
  | 'NEEDS_BOOKING_VERIFICATION';

export interface ExperienceCandidate {
  experienceProductId: string;
  label: string;
  regionId: string;
  packId: string;
  meetingPlaceId?: number;
  regionAnchorPlaceId?: number;
  bookingRequired: boolean;
  durationMinutes?: number;
  status: ExperienceDiscoveryStatus;
  selectedBecause: string[];
  gateOutcome: GateOutcome;
}

export type CatalogResolutionIssueCode =
  | 'MISSING_COORDINATES'
  | 'PLACE_NOT_FOUND'
  | 'ENTITY_TYPE_MISMATCH'
  | 'TOWN_AS_LODGING'
  | 'CENTROID_NOT_VISIT_POINT'
  | 'EXPERIENCE_REUSED_PLACE_ID'
  | 'ALIAS_NOT_NORMALIZED'
  | 'MISSING_ACCESS_ANCHOR';

export interface CatalogResolutionIssue {
  placeId?: number;
  experienceProductId?: string;
  code: CatalogResolutionIssueCode;
  message: string;
  severity: 'WARNING' | 'ERROR';
}

export type SeedExclusionReason =
  | 'ALIAS'
  | 'USER_EXCLUDED'
  | 'VEHICLE_INCOMPATIBLE'
  | 'SEASONALLY_UNAVAILABLE'
  | 'INSUFFICIENT_DAYS'
  | 'CORRIDOR_ONLY_NO_ATTRACTION'
  | 'CATALOG_UNRESOLVED'
  | 'HIGHLANDS_GATE'
  | 'PARENT_UNAVAILABLE'
  | 'LOW_SCORE';

export interface SeedExclusion {
  placeId?: number;
  experienceProductId?: string;
  label?: string;
  regionId?: string;
  reason: SeedExclusionReason;
  detail?: string;
}

export interface SeedEvidence {
  type: string;
  message: string;
  regionId?: string;
  packId?: string;
  meta?: Record<string, unknown>;
}

export type GateOutcomeStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface GateOutcome {
  status: GateOutcomeStatus;
  codes: string[];
  notes?: string[];
}

export interface RegionalCatalogGapIssue {
  issueType: 'REGIONAL_CATALOG_GAP';
  regionId: string;
  missingCapabilities: string[];
  severity: 'WARNING' | 'ERROR';
}

export interface InitialPlanSeedResult {
  selectedRegions: RegionSelection[];
  candidateEntities: SeedCandidate[];
  experienceCandidates: ExperienceCandidate[];
  unresolvedEntities: CatalogResolutionIssue[];
  exclusions: SeedExclusion[];
  evidence: SeedEvidence[];
  catalogGaps: RegionalCatalogGapIssue[];
  /** User-confirmed lodging bookings — hard overnight anchors for arrange/proposal */
  confirmedLodgings?: PlaceRef[];
  /** Arrival / departure gateways (airport or hub placeIds) */
  originGateway?: PlaceRef;
  exitGateway?: PlaceRef;
  /** Projected relations for arrange (canonical placeIds only) */
  relations: Array<{
    groupId: string;
    relationType: IcelandRegionRelationType;
    memberCanonicalPlaceIds: number[];
    packId: string;
    notes?: string;
  }>;
  dayScopeRules: {
    requireSubregionDayScopeByPack: Record<string, boolean>;
    subregions: Array<{
      packId: string;
      subregionId: string;
      displayName: string;
      memberCanonicalPlaceIds: number[];
    }>;
    /** Arrange must enforce these — not data-only fields */
    policy: {
      oneHighSpanSubregionPerNaturalDay: true;
      crossSubregionRequiresExplicitTransferDay: true;
      highlandsRequiresExplicitBranch: true;
      doNotCollapseSameRegionIntoSameDay: true;
    };
  };
}

export interface SeededPlanItemEvidence {
  source: 'GOLDEN_SET' | 'USER_REQUEST' | 'CATALOG' | 'EXPERIENCE';
  regionId: string;
  subregionId?: string;
  coverageRole?: IcelandRegionCoverageRole;
  canonicalPlaceId?: number;
  selectedBecause: string[];
  excludedAlternatives?: Array<{ entityId: string; reasons: string[] }>;
  gateOutcome: GateOutcome;
  constraintAssessmentId?: string;
}

/** Arrange-ready input — never creates PlanVersion by itself */
export interface InitialPlanArrangeInput {
  tripId: string;
  writesPlanVersion: false;
  requiresPreviewConfirmApply: true;
  attractionCandidates: Array<{
    canonicalPlaceId: number;
    label: string;
    regionId: string;
    packId: string;
    subregionId?: string;
    coverageRole?: IcelandRegionCoverageRole;
    score: number;
    countsTowardAttractionCoverage: boolean;
    relationGroupIds: string[];
    parentCanonicalPlaceId?: number;
    evidence: SeededPlanItemEvidence;
  }>;
  supportNodes: Array<{
    canonicalPlaceId: number;
    label: string;
    regionId: string;
    packId?: string;
    entityType: IcelandRegionEntityType;
    routeRoles?: string[];
  }>;
  experienceCandidates: ExperienceCandidate[];
  relations: InitialPlanSeedResult['relations'];
  dayScopeRules: InitialPlanSeedResult['dayScopeRules'];
  softAlternativePairs: Array<{
    groupId: string;
    placeIds: [number, number];
    policy: 'ALLOW_BOTH' | 'PREFER_HIGHER_SCORE_WHEN_TIGHT';
  }>;
  coVisitClusters: Array<{ groupId: string; placeIds: number[] }>;
  parentChild: Array<{ parentId: number; childId: number }>;
  unresolvedEntities: CatalogResolutionIssue[];
  catalogGaps: RegionalCatalogGapIssue[];
  evidence: SeedEvidence[];
  /** Hard overnight anchors from user bookings (placeId required) */
  confirmedLodgings?: PlaceRef[];
  /** Arrival gateway (typically KEF) — day-1 morning drive start */
  originGateway?: PlaceRef;
  /** Departure gateway — last-day evening drive end */
  exitGateway?: PlaceRef;
}
