/**
 * Trip Shell + Stored Initial Plan Proposal — Preview / Confirm / Apply.
 * PlanVersion = formal Iceland applied itinerary write (see AppliedInitialPlanVersion).
 */

import type {
  CatalogResolutionIssue,
  RegionSelection,
} from './iceland-initial-plan-seed.types';
import type {
  InitialPlanDay,
  ProposalConfirmation,
  ProposalIssue,
  RegionCoverageSummary,
} from './iceland-initial-plan-proposal.types';
import type {
  InitialPlanAuthoritativeVerification,
  InitialPlanDriftVector,
  InitialPlanPreflightResult,
  InitialPlanVerificationAudit,
} from './iceland-initial-plan-verification.types';
import type { ShadowVsPlatformContrastPreviewSummary } from './iceland-shadow-vs-platform-contrast-preview.types';
import type { ShadowVsPlatformContrastReport } from './iceland-shadow-vs-platform-contrast.types';
import type { IcelandSelfDriveDrivingSettingsState } from './iceland-self-drive.types';

export type TripShellCreationStatus =
  | 'CONTEXT_SAVED'
  | 'GENERATING_PREVIEW'
  | 'PREVIEW_READY'
  | 'PREVIEW_PARTIAL'
  | 'PREVIEW_BLOCKED'
  | 'PREVIEW_FAILED'
  | 'PREVIEW_CONFIRMED'
  | 'ITINERARY_APPLIED';

export interface TripShell {
  tripId: string;
  ownerId: string;
  lifecycle: 'PLANNING';
  creationStatus: TripShellCreationStatus;
  destinationCode: 'IS';
  travelDates: { startDate: string; endDate: string };
  contextVersion: number;
  contextHash: string;
  /** Serialized create context for proposal generation */
  contextPayload: IcelandTripShellContextPayload;
  activeProposalId?: string;
  /** Set after successful Apply — Iceland PlanVersion id */
  activePlanVersionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IcelandTripShellContextPayload {
  regionIds?: string[];
  vehicleProfile?: {
    is4wd?: boolean;
    allowsFRoad?: boolean;
    allowsRiverCrossing?: boolean;
    driveType?: string;
    riverCrossingQualified?: boolean;
  };
  requestedPlaceIds?: number[];
  excludedPlaceIds?: number[];
  confirmedLodgings?: Array<{ placeId?: number; label?: string; nightDate?: string }>;
  preferences?: {
    dailyDrivingLimitMin?: number;
    pace?: 'relaxed' | 'standard' | 'intensive';
  };
  startLocationCode?: string;
  endLocationCode?: string;
  endSameAsStart?: boolean;
  travelerCount?: number;
  /** In-memory driving-settings blob (GET/PATCH …/driving-settings on shell) */
  drivingSettings?: IcelandSelfDriveDrivingSettingsState;
}

export type StoredProposalStatus =
  | 'GENERATING'
  | 'VERIFIED'
  | 'VERIFIED_WITH_CONFIRMATIONS'
  | 'CONFIRMED'
  | 'APPLIED'
  | 'BLOCKED'
  | 'FAILED'
  | 'STALE'
  | 'SUPERSEDED';

/** User Confirm Contract acknowledgment — never PlanVersion by itself */
export interface ProposalConfirmationRecord {
  confirmedAt: string;
  confirmedBy: string;
  acknowledgedConfirmationIds: string[];
  note?: string;
}

/** Formal Iceland PlanVersion write — projected from confirmed dayPlans */
export interface AppliedInitialPlanItem {
  itineraryItemId: string;
  sourceItemId: string;
  dayIndex: number;
  date: string;
  placeId?: number;
  label: string;
  startMin: number;
  endMin: number;
  startTime: string; // HH:mm
  endTime: string;
  kind: string;
}

export interface AppliedInitialPlanVersion {
  planVersionId: string;
  tripId: string;
  proposalId: string;
  proposalHash: string;
  contextVersion: number;
  contextHash: string;
  appliedAt: string;
  appliedBy: string;
  appliedItemCount: number;
  items: AppliedInitialPlanItem[];
  /** Provenance — not OR-Tools */
  sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN';
  verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT';
  writesPlanVersion: true;
  /** prisma = Trip/TripDay/ItineraryItem rows written */
  persistence: 'prisma' | 'memory';
  prismaTripId?: string;
}

export interface StoredInitialPlanProposal {
  proposalId: string;
  tripId: string;
  proposalVersion: number;
  parentProposalId?: string;
  status: StoredProposalStatus;
  sourceEngine: 'ICELAND_COVERAGE_DAY_ASSIGN';
  verificationAuthority: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT';
  contextVersion: number;
  contextHash: string;
  arrangeInputHash: string;
  proposalHash: string;
  verificationSnapshotHash: string;
  dayPlans: InitialPlanDay[];
  coverageSummary: RegionCoverageSummary[];
  selectedRegions: RegionSelection[];
  confirmations: ProposalConfirmation[];
  warnings: ProposalIssue[];
  blockingIssues: ProposalIssue[];
  unresolvedEntities: CatalogResolutionIssue[];
  preflight: InitialPlanPreflightResult;
  verification: InitialPlanAuthoritativeVerification;
  audit: InitialPlanVerificationAudit;
  /**
   * Calibration only — Shadow vs platform comparable peer.
   * Never used for Confirm/Apply gates.
   */
  shadowVsPlatformContrast?: ShadowVsPlatformContrastReport;
  confirmationRecord?: ProposalConfirmationRecord;
  appliedPlanVersionId?: string;
  /** true only after successful Apply */
  writesPlanVersion: boolean;
  createdAt: string;
  expiresAt?: string;
  idempotencyKey?: string;
}

export interface InitialPlanPreviewDay {
  dayIndex: number;
  date: string;
  subregionId?: string;
  startAnchor?: {
    placeId?: number;
    label?: string;
    nightDate?: string;
    source?: string;
  };
  endAnchor?: {
    placeId?: number;
    label?: string;
    nightDate?: string;
    source?: string;
  };
  items: Array<{
    itemId: string;
    placeId?: number;
    label: string;
    startMin: number;
    endMin: number;
    selectedBecause: string[];
    excludedAlternatives?: Array<{ entityId: string; reasons: string[] }>;
    visitClusterId?: string;
  }>;
  drivingMinutes: number;
  activityMinutes: number;
  warnings: string[];
}

export interface InitialPlanPreviewResponse {
  tripId: string;
  proposalId: string;
  status:
    | 'VERIFIED'
    | 'VERIFIED_WITH_CONFIRMATIONS'
    | 'CONFIRMED'
    | 'APPLIED'
    | 'BLOCKED'
    | 'FAILED'
    | 'STALE';
  summary: {
    dayCount: number;
    selectedPlaceCount: number;
    drivingMinutes: number;
    unresolvedEntityCount: number;
  };
  days: InitialPlanPreviewDay[];
  coverage: RegionCoverageSummary[];
  confirmations: ProposalConfirmation[];
  warnings: ProposalIssue[];
  blockingIssues: ProposalIssue[];
  verification: {
    aggregateOutcome: string;
    dominantCid?: string;
    sessionConsistencyScore: number;
    authoritative: true;
    authorityProvider: 'ICELAND_SHADOW_UNIFIED_ASSESSMENT';
    allowConfirm: boolean;
  };
  confirmation?: ProposalConfirmationRecord;
  appliedPlanVersionId?: string;
  audit: {
    contextHash: string;
    arrangeInputHash: string;
    proposalHash: string;
    verificationSnapshotHash: string;
    driftVector: InitialPlanDriftVector;
  };
  capabilities: {
    canPreview: boolean;
    /** True when Shadow VERIFY allows confirm and proposal not yet CONFIRMED */
    canConfirm: boolean;
    /** True only when status === CONFIRMED (Apply card) */
    canApply: boolean;
  };
  /**
   * Calibration vs platform comparable rules. Optional.
   * FE: display/debug only — never gate Confirm/Apply on this.
   */
  calibration?: {
    shadowVsPlatform: ShadowVsPlatformContrastPreviewSummary;
  };
  productCopy: {
    title: string;
    body: string;
  };
  writesPlanVersion: boolean;
}

export interface CreateTripShellRequest {
  destinationCode: 'IS';
  startDate: string;
  endDate: string;
  travelMode?: 'SELF_DRIVE';
  vehicleProfile?: IcelandTripShellContextPayload['vehicleProfile'];
  requestedPlaceIds?: Array<string | number>;
  excludedPlaceIds?: Array<string | number>;
  confirmedLodgings?: Array<{
    placeId?: number | string;
    label?: string;
    nightDate?: string;
  }>;
  preferences?: IcelandTripShellContextPayload['preferences'];
  regionIds?: string[];
  startLocationCode?: string;
  endLocationCode?: string;
  endSameAsStart?: boolean;
  travelerCount?: number;
}

export interface CreateTripShellResponse {
  tripId: string;
  creationStatus: TripShellCreationStatus;
  contextVersion: number;
  contextHash: string;
  writesPlanVersion: false;
}

export interface CreateProposalResponse {
  tripId: string;
  proposalId: string;
  status: StoredProposalStatus;
  previewAvailable: boolean;
  /** Mirrors capabilities.canConfirm — driven by Shadow VERIFY allowConfirm */
  confirmAllowed: boolean;
  applyAllowed: boolean;
  writesPlanVersion: false;
  links: { self: string; confirm?: string; apply?: string };
}

export interface ConfirmProposalRequest {
  /** Must cover every confirmation with blockingApply === true */
  acknowledgedConfirmationIds: string[];
  note?: string;
}

export interface ConfirmProposalResponse {
  tripId: string;
  proposalId: string;
  status: 'CONFIRMED';
  confirmedAt: string;
  acknowledgedConfirmationIds: string[];
  confirmAllowed: false;
  /** Apply card open after Confirm */
  applyAllowed: true;
  writesPlanVersion: false;
  preview: InitialPlanPreviewResponse;
  links: { self: string; preview: string; apply: string };
}

export interface ApplyProposalRequest {
  /** Must match shell when provided */
  contextVersion?: number;
  contextHash?: string;
  note?: string;
}

export interface ApplyProposalResponse {
  tripId: string;
  proposalId: string;
  planVersionId: string;
  status: 'APPLIED';
  appliedAt: string;
  appliedItemCount: number;
  confirmAllowed: false;
  applyAllowed: false;
  writesPlanVersion: true;
  planVersionWriteCount: number;
  persistence: 'prisma' | 'memory';
  prismaTripId?: string;
  preview: InitialPlanPreviewResponse;
  /** Calibration only — never gates Apply success. */
  calibration?: {
    postApplyBundle?: NonNullable<
      ShadowVsPlatformContrastPreviewSummary['postApplyBundle']
    >;
  };
  links: { self: string; preview: string; planVersion: string };
}

export interface InitialPlanGenerationTrace {
  traceId: string;
  tripId: string;
  proposalId: string;
  contextHash: string;
  pipelineVersion: string;
  goldenSetVersion: string;
  ruleSetVersion: string;
  verificationProvider: string;
  preflightOutcome: string;
  firstVerifyOutcome: string;
  repairTriggered: boolean;
  secondVerifyOutcome?: string;
  dominantCid?: string;
  elapsedMs: number;
}
