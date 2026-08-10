/**
 * Iceland Initial Plan Proposal V1 — preview read model (never PlanVersion).
 */

import type {
  CatalogResolutionIssue,
  ExperienceCandidate,
  GateOutcome,
  RegionSelection,
  SeededPlanItemEvidence,
} from './iceland-initial-plan-seed.types';
import type { PlaceRef } from './iceland-initial-plan-seed.types';

export type BuildInitialPlanProposalStatus =
  | 'READY_FOR_PREVIEW'
  | 'PARTIAL'
  | 'NEEDS_USER_INPUT'
  | 'NO_FEASIBLE_PLAN';

export type InitialPlanProposalVerifyStatus =
  | 'VERIFIED'
  | 'VERIFIED_WITH_CONFIRMATIONS'
  | 'REPAIR_REQUIRED'
  | 'INFEASIBLE';

export type InitialPlanItemKind =
  | 'ATTRACTION'
  | 'ATTRACTION_AREA'
  | 'SUPPORT'
  | 'EXPERIENCE_OPTIONAL';

export interface InitialPlanItem {
  itemId: string;
  placeId?: number;
  experienceProductId?: string;
  label: string;
  kind: InitialPlanItemKind;
  startMin: number;
  endMin: number;
  evidence: SeededPlanItemEvidence;
  /** Parent cluster — child does not count as separate region stay */
  visitClusterId?: string;
  countsTowardAttractionCoverage: boolean;
}

export interface InitialPlanDay {
  dayIndex: number;
  date: string;
  dayId: string;
  startAnchor?: PlaceRef;
  endAnchor?: PlaceRef;
  subregionId?: string;
  packIds: string[];
  items: InitialPlanItem[];
  drivingMinutes: number;
  activityMinutes: number;
  bufferMinutes: number;
  feasibilityStatus: 'ok' | 'warning' | 'blocked';
  warnings: string[];
}

export interface RegionCoverageSummary {
  regionId: string;
  packId?: string;
  coverageStatus: string;
  regionalGoldenSetReady: boolean;
  selectedAttractionPlaceIds: number[];
  countsTowardAttractionCoverage: number;
  corridorOnly: boolean;
  message?: string;
}

export interface ProposalConfirmation {
  confirmationId: string;
  kind: 'EXPERIENCE_BOOKING' | 'GATE_WARN' | 'NEED_CONFIRM' | 'CATALOG_GAP';
  message: string;
  placeId?: number;
  experienceProductId?: string;
  blockingApply: boolean;
}

export interface ExperienceProposal {
  experienceProductId: string;
  label: string;
  regionId: string;
  status: ExperienceCandidate['status'];
  meetingPlaceId?: number;
  selectedBecause: string[];
  requiresBookingVerification: true;
}

export interface ProposalIssue {
  code: string;
  severity: 'WARNING' | 'ERROR';
  message: string;
  placeId?: number;
  dayIndex?: number;
  nightDate?: string;
}

export interface SolverMetaSummary {
  engine: 'ICELAND_COVERAGE_DAY_ASSIGN';
  strategy: string;
  version: string;
  elapsedMs: number;
  seed: number;
  candidateId: string;
  /** Soft/hard relation counts projected into solver */
  relationProjection: {
    parentChild: number;
    coVisitClusters: number;
    softAlternatives: number;
    dayScopePacks: number;
  };
}

export interface VerificationSummary {
  status: InitialPlanProposalVerifyStatus;
  pass: boolean;
  repaired: boolean;
  repairAttempts: number;
  blockingCodes: string[];
  warnings: string[];
  /** Linked to dayIndex / itemId when available */
  findings: Array<{
    code: string;
    severity: 'INFO' | 'WARN' | 'BLOCK' | 'EXECUTION_BLOCK';
    message: string;
    dayIndex?: number;
    itemId?: string;
    placeId?: number;
  }>;
}

export interface InitialPlanProposal {
  proposalId: string;
  tripId: string;
  version: number;
  days: InitialPlanDay[];
  selectedRegions: RegionSelection[];
  coverageSummary: RegionCoverageSummary[];
  requiredConfirmations: ProposalConfirmation[];
  optionalExperiences: ExperienceProposal[];
  unresolvedIssues: ProposalIssue[];
  solverMeta: SolverMetaSummary;
  verificationSummary: VerificationSummary;
  evidence: SeededPlanItemEvidence[];
  writesPlanVersion: false;
}

export interface InitialPlanVerification {
  status: InitialPlanProposalVerifyStatus;
  summary: VerificationSummary;
  /** Forbid Confirm/Apply when true */
  executionBlocked: boolean;
  writesPlanVersion: false;
}

export interface InitialPlanDecision {
  decisionId: string;
  kind:
    | 'INCLUDED'
    | 'EXCLUDED'
    | 'TRIMMED_SOFT_ALT'
    | 'CLUSTERED_CO_VISIT'
    | 'PARENT_CHILD_MERGED'
    | 'DAY_SCOPE_SPLIT'
    | 'GATE_BLOCKED'
    | 'NEEDS_CONFIRMATION';
  placeId?: number;
  relatedPlaceIds?: number[];
  dayIndex?: number;
  reasons: string[];
}

export interface BuildInitialPlanProposalCommand {
  tripId: string;
  /** Create DTO shape — may be CreateIcelandSelfDriveTripDto at runtime */
  createInput: {
    dateRange: { startDate: string; endDate: string };
    regionIds?: string[];
    startLocationCode?: string;
    endLocationCode?: string;
    endSameAsStart?: boolean;
    vehicleAcquisition?: string;
    bookings?: Array<{
      clientId: string;
      kind: string;
      name: string;
      placeId?: number | null;
      startDate: string;
    }>;
    destinationCode?: string;
    productLine?: string;
    travelerCount?: number;
  };
  vehicleProfile?: {
    is4wd?: boolean;
    allowsFRoad?: boolean;
    allowsRiverCrossing?: boolean;
    vehicleClass?: string;
  };
  preferences?: {
    mustIncludePlaceIds?: number[];
    excludePlaceIds?: number[];
    interestTags?: string[];
    pace?: 'relaxed' | 'standard' | 'intensive';
  };
  dailyDrivingLimitMin?: number;
  /** Soft-alt capacity pressure for arrange projector */
  softAltMaxAttractions?: number;
  /** Skip Prisma trip shell (unit / dry-run) */
  skipTripShell?: boolean;
  userId?: string;
}

export interface BuildInitialPlanProposalResult {
  tripId: string;
  proposalId: string;
  status: BuildInitialPlanProposalStatus;
  arrangeInputHash: string;
  proposal: InitialPlanProposal;
  /** @deprecated generator-era summary — prefer authoritativeVerification */
  verification: InitialPlanVerification;
  /** Generator self-check only */
  preflight?: import('./iceland-initial-plan-verification.types').InitialPlanPreflightResult;
  /** Sole authority for Preview / Confirm gating */
  authoritativeVerification?: import('./iceland-initial-plan-verification.types').InitialPlanAuthoritativeVerification;
  /** Final VERIFY snapshot (for Shadow vs platform contrast). */
  verificationSnapshot?: import('./iceland-initial-plan-verification.types').InitialPlanVerificationSnapshot;
  unresolvedEntities: CatalogResolutionIssue[];
  decisions: InitialPlanDecision[];
  writesPlanVersion: false;
  planVersionWriteCount?: 0;
}

export interface IcelandSolverNodeMeta {
  nodeId: string;
  placeId?: number;
  experienceProductId?: string;
  label: string;
  reward: number;
  isRequired: boolean;
  isForbidden: boolean;
  subregionId?: string;
  packId?: string;
  regionId?: string;
  coverageRole?: string;
  parentNodeId?: string;
  visitClusterId?: string;
  countsTowardAttractionCoverage: boolean;
  gateOutcome: GateOutcome;
  evidence: SeededPlanItemEvidence;
  serviceDurationMin: number;
}
