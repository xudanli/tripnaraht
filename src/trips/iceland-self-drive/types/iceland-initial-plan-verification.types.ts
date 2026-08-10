/**
 * Independent VERIFY Bridge contracts — never PlanVersion.
 * Authority: Shadow Unified Assessment on verification snapshot (not day-assign).
 */

import type { CatalogResolutionIssue } from './iceland-initial-plan-seed.types';

export type GeneratorCheckType = 'PREFLIGHT';

export interface VerificationPlaceRef {
  placeId?: number;
  label?: string;
  nightDate?: string;
  source?: 'CONFIRMED_BOOKING' | 'GOLDEN_SET_SOFT' | string;
}

export interface VerificationTripContext {
  startDate: string;
  endDate: string;
  regionIds: string[];
  vehicleProfile?: {
    is4wd?: boolean;
    allowsFRoad?: boolean;
    allowsRiverCrossing?: boolean;
    vehicleClass?: string;
  };
  /** @deprecated prefer confirmedLodgings with nightDate */
  confirmedLodgingPlaceIds?: number[];
  /** Confirmed overnight bookings — drives ICELAND_LODGING_ANCHOR_001 */
  confirmedLodgings?: Array<{
    placeId: number;
    label?: string;
    nightDate?: string;
  }>;
  dailyDrivingLimitMin?: number;
}

export interface InitialPlanVerificationItem {
  itemId: string;
  canonicalPlaceId?: number;
  experienceProductId?: string;
  startTime?: string;
  endTime?: string;
  durationMin: number;
  latitude?: number;
  longitude?: number;
  roadRequirements?: {
    requiresFroad?: boolean;
    requires4wd?: boolean;
    riverCrossingRisk?: boolean;
  };
  bookingState?:
    | 'NOT_REQUIRED'
    | 'NEEDS_BOOKING_VERIFICATION'
    | 'CONFIRMED';
  sourceEvidenceRefs: string[];
  subregionId?: string;
  packId?: string;
}

export interface InitialPlanVerificationDay {
  dayIndex: number;
  date: string;
  startAnchor?: VerificationPlaceRef;
  endAnchor?: VerificationPlaceRef;
  lodgingAnchor?: VerificationPlaceRef;
  subregionId?: string;
  items: InitialPlanVerificationItem[];
  totalDrivingMin: number;
  totalActivityMin: number;
  plannedBufferMin: number;
  activatedDayScopeRules: string[];
}

export interface InitialPlanVerificationSnapshot {
  verificationId: string;
  tripId: string;
  proposalId: string;
  proposalVersion: number;
  proposalHash: string;
  contextHash: string;
  generatedBy: 'ICELAND_COVERAGE_DAY_ASSIGN';
  verificationMode: 'SHADOW';
  days: InitialPlanVerificationDay[];
  tripContext: VerificationTripContext;
  unresolvedEntities: CatalogResolutionIssue[];
  /** Packs that require one subregion per day — rule input, not generator score */
  dayScopePackIds: string[];
  writesPlanVersion: false;
}

export interface PreflightIssue {
  code: string;
  severity: 'WARN' | 'FAIL';
  message: string;
  dayIndex?: number;
  itemId?: string;
}

export interface InitialPlanPreflightResult {
  status: 'PREFLIGHT_PASS' | 'PREFLIGHT_WARN' | 'PREFLIGHT_FAIL';
  issues: PreflightIssue[];
  authoritative: false;
  checkType: GeneratorCheckType;
  writesPlanVersion: false;
}

export interface ConstraintAssessmentEvidence {
  cid: string;
  status: 'PASS' | 'WARN' | 'BLOCK' | 'NEED_CONFIRM' | 'REPAIR' | 'EXECUTION_BLOCK';
  observedValue?: number;
  limitValue?: number;
  /** slack >= 0 satisfied; slack < 0 violated */
  slack?: number;
  unit?: string;
  affectedDayIndex?: number;
  affectedItemIds?: string[];
  basis: string;
  evidenceRefs: string[];
}

export type AuthoritativeAggregateOutcome =
  | 'PASS'
  | 'WARN'
  | 'NEED_CONFIRM'
  | 'REPAIR'
  | 'BLOCK'
  | 'EXECUTION_BLOCK';

export type AuthoritativeVerificationStatus =
  | 'VERIFIED'
  | 'VERIFIED_WITH_CONFIRMATIONS'
  | 'REPAIR_REQUIRED'
  | 'BLOCKED'
  | 'MANUAL_REVIEW_REQUIRED';

export interface InitialPlanDriftVector {
  dayAssignmentChanged: number;
  selectedCandidateChanged: number;
  excludedCandidateChanged: number;
  durationChangedMin: number;
  drivingChangedMin: number;
  subregionScopeChanged: number;
}

export interface InitialPlanVerificationAudit {
  dominant_cid?: string;
  drift_vector: InitialPlanDriftVector;
  session_consistency_score: number;
  consistencyBand: 'CONSISTENT' | 'MINOR_DRIFT' | 'INCONSISTENT';
  delta_reason: string[];
  delta_utility: number;
  /** For replay recomputation */
  blockingCids: string[];
  confirmCids: string[];
  affectedDayIndexes: number[];
  criticalSlacks: Array<{ cid: string; slack: number }>;
}

export interface InitialPlanAuthoritativeVerification {
  verificationId: string;
  proposalId: string;
  status: AuthoritativeVerificationStatus;
  aggregateOutcome: AuthoritativeAggregateOutcome;
  assessments: ConstraintAssessmentEvidence[];
  audit: InitialPlanVerificationAudit;
  authoritative: true;
  allowConfirm: boolean;
  allowPreview: boolean;
  writesPlanVersion: false;
}

export type RepairOperationKind =
  | 'REMOVE_ITEM'
  | 'SPLIT_DAY_SCOPE'
  | 'DOWNGRADE_BOOKING_STATE'
  | 'DROP_VEHICLE_INCOMPATIBLE'
  | 'SET_LODGING_ANCHOR';

export interface RepairOperation {
  kind: RepairOperationKind;
  itemId?: string;
  dayIndex?: number;
  cid: string;
  detail?: string;
}

export interface InitialPlanRepairResult {
  repairedProposalId: string;
  parentProposalId: string;
  appliedOperations: RepairOperation[];
  repairedCids: string[];
  remainingCids: string[];
  terminal: false;
  writesPlanVersion: false;
}
