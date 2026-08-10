/**
 * Route exposure × insurance coverage gap for Iceland rental.
 * Structured flags only — never scrape free-text policy PDFs.
 */

export type InsuranceCoverageTier = 'BASIC' | 'STANDARD' | 'FULL';

export type InsuranceCoverageDimension =
  | 'COLLISION'
  | 'GRAVEL_CHIP'
  | 'SAND_ASH'
  | 'WINDSHIELD'
  | 'TIRE'
  | 'UNDERCARRIAGE'
  | 'WATER_FORDING'
  | 'TOWING'
  | 'DEDUCTIBLE';

export type CoverageStatus =
  | 'COVERED'
  | 'NOT_COVERED'
  | 'UNCONFIRMED'
  | 'EXCLUDED';

export type RouteExposureCode =
  | 'GRAVEL_ROAD'
  | 'GRAVEL_PARKING'
  | 'WIND_EXPOSED'
  | 'UNPAVED_SPUR'
  | 'F_ROAD_HIGHLAND'
  | 'FORD_CROSSING';

export interface RouteExposureInput {
  gravelRoad?: boolean;
  gravelParking?: boolean;
  windExposed?: boolean;
  unpavedSpur?: boolean;
  fRoadOrHighland?: boolean;
  fordCrossing?: boolean;
}

export interface RouteExposureAssessment {
  codes: RouteExposureCode[];
  reasons: string[];
}

export interface CoverageGapItem {
  dimension: InsuranceCoverageDimension;
  status: CoverageStatus;
  triggeredBy: RouteExposureCode[];
  reasonCode: string;
}

export interface InsuranceCoverageGapAssessment {
  tier: InsuranceCoverageTier;
  routeExposure: RouteExposureAssessment;
  coverageByDimension: Partial<Record<InsuranceCoverageDimension, CoverageStatus>>;
  gaps: CoverageGapItem[];
  /** True when any gap is NOT_COVERED or EXCLUDED (stronger than UNCONFIRMED) */
  hasHardGap: boolean;
  /** True when any gap including UNCONFIRMED */
  hasGap: boolean;
  gate: 'ALLOW' | 'NEED_CONFIRM';
  recommendedActions: string[];
  fordingExcluded: true;
  evidencePath: string;
}

export interface InsuranceCoverageMatrixFile {
  schemaId: string;
  version: string;
  status: string;
  tiers: Record<
    InsuranceCoverageTier,
    Record<InsuranceCoverageDimension, CoverageStatus>
  >;
  exposureToDimensions: Record<RouteExposureCode, InsuranceCoverageDimension[]>;
}
