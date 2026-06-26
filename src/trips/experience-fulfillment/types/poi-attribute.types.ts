/**
 * POI 五类属性 — PRD §8.3
 */

export type EvidenceSourceType =
  | 'OFFICIAL'
  | 'ROAD_DATA'
  | 'SUPPLIER'
  | 'MAP'
  | 'VERIFIED_FULFILLMENT'
  | 'USER'
  | 'CREATOR'
  | 'LLM_INFERENCE';

export type ReviewerStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** A. 体验属性 */
export interface PoiExperienceAttribute {
  visualOpenness?: number;
  landscapeScale?: number;
  solitude?: number;
  cinematicQuality?: number;
  commercialization?: number;
  sensoryIntensity?: number;
  novelty?: number;
}

/** B. 人群适配 */
export interface PoiAudienceAlignment {
  elderlyFriendly?: number;
  childFriendly?: number;
  photographerFriendly?: number;
  coupleFriendly?: number;
  soloFriendly?: number;
  mobilityLimitedFriendly?: number;
}

/** C. 成本与负荷 */
export interface PoiCostLoad {
  physicalEffort?: number;
  timeCost?: number;
  monetaryCost?: number;
  drivingLoad?: number;
  decisionLoad?: number;
  coordinationLoad?: number;
  recoveryCost?: number;
}

/** D. 可行性条件 */
export interface PoiFeasibilityConstraint {
  roadType?: string;
  vehicleRequirement?: string[];
  openingWindow?: { start: string; end: string };
  seasonalAvailability?: string[];
  weatherLimits?: string[];
  reservationRequired?: boolean;
  minimumAge?: number;
  minimumFitness?: string;
  daylightRequirement?: boolean;
}

/** E. 证据属性 */
export interface PoiEvidenceProvenance {
  sourceType: EvidenceSourceType;
  sourceUri?: string;
  observedAt: string;
  validUntil?: string;
  confidence: number;
  extractionMethod?: string;
  reviewerStatus?: ReviewerStatus;
}

export interface PoiExperienceClaim {
  claimId: string;
  poiId: string;
  experienceAttributes?: PoiExperienceAttribute;
  audienceAlignment?: PoiAudienceAlignment;
  costLoad?: PoiCostLoad;
  feasibility?: PoiFeasibilityConstraint;
  evidence: PoiEvidenceProvenance;
  /** 条件化标签 */
  conditionalTags?: readonly string[];
}
