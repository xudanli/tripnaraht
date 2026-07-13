/**
 * Trip Prerequisite — 共享事实 SSOT
 * 同一 prerequisite 双投影至出发准备任务与可执行性 issue
 * @see internal-docs/product/PRODUCT_READINESS_MODEL.md §6
 */

import type { ReadinessCategory } from '../../readiness/types/readiness-pack.types';

export type TripPrerequisiteKind =
  | 'poi_access_reservation'
  | 'poi_access_blocked'
  | 'experience_regret_confirmation'
  | 'visa_entry'
  | 'permit'
  | 'activity_booking'
  | 'other';

export type TripPrerequisiteStatus =
  | 'UNCONFIRMED'
  | 'IN_PROGRESS'
  | 'CONFIRMED'
  | 'NOT_APPLICABLE';

export type TripPrerequisiteSourceSystem =
  | 'poi_access'
  | 'experience_regret'
  | 'readiness_pack'
  | 'manual';

export interface TripPrerequisiteRelatedActivity {
  tripItemId?: string;
  tripDayId?: string;
  poiId?: string;
  poiName?: string;
  dayNumber?: number;
}

export interface TripPrerequisiteSource {
  system: TripPrerequisiteSourceSystem;
  /** 关联 feasibility issue id（稳定 dedupe 前） */
  feasibilityIssueId?: string;
  packRuleId?: string;
}

export interface TripPrerequisiteDeparturePrepProjection {
  findingItemId: string;
  level: 'blocker' | 'must' | 'should';
  category: ReadinessCategory;
}

export interface TripPrerequisiteFeasibilityProjection {
  issueId: string;
  issueKind?: string;
}

export interface TripPrerequisite {
  /** SSOT — checklist / finding marks 使用此 id */
  id: string;
  tripId: string;
  kind: TripPrerequisiteKind;
  title: string;
  description?: string;
  status: TripPrerequisiteStatus;
  /** 建议完成日期 ISO (YYYY-MM-DD) */
  deadline?: string;
  relatedActivity?: TripPrerequisiteRelatedActivity;
  source: TripPrerequisiteSource;
  projections: {
    departurePrep: TripPrerequisiteDeparturePrepProjection;
    feasibility?: TripPrerequisiteFeasibilityProjection;
  };
  confirmedAt?: string;
  updatedAt: string;
}

export interface TripPrerequisiteListDto {
  schema: 'tripnara.trip_prerequisites@v1';
  tripId: string;
  calculatedAt: string;
  prerequisites: TripPrerequisite[];
  summary: {
    total: number;
    open: number;
    confirmed: number;
    notApplicable: number;
  };
  links: {
    feasibilityReport: string;
    departurePreparation: string;
    departureGate: string;
  };
}
