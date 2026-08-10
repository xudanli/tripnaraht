import type { CanonicalOverallStatus } from '../../../decision-runtime/constraints/contracts/canonical-constraint-report';
import type { ConstraintEvaluationStatus } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import type { PostApplyBundleContrast } from '../utils/post-apply-bundle-contrast.util';

/** Platform keys we can compare offline without Prisma UnifiedAssessment bundle. */
export type PlatformComparableConstraintKey =
  | 'MAX_DAILY_DRIVE'
  | 'OFFICIAL_IS_FROAD_2WD'
  | 'VEHICLE_4WD_REQUIRED'
  /** Self-drive river ford / crossing — converged with ICELAND_VEHICLE_RIVER_001. */
  | 'RIVER_CROSSING_SELF_DRIVE'
  /** Confirmed lodging overnight anchor — converged with ICELAND_LODGING_ANCHOR_001. */
  | 'CONFIRMED_LODGING_ANCHOR';

export type ContrastSeverityBand = 'PASS' | 'SOFT' | 'HARD';

export interface PlatformComparableFinding {
  constraintKey: PlatformComparableConstraintKey;
  status: ConstraintEvaluationStatus;
  severityBand: ContrastSeverityBand;
  affectedDayIndex?: number;
  message: string;
  evidenceRefs: string[];
  basis: string;
}

export interface PlatformComparableReport {
  /** Explicit peer id — not full UnifiedConstraintAssessmentService. */
  peerId: 'platform_comparable_rule_surface@v1';
  overallStatus: CanonicalOverallStatus;
  /** Confirm-oriented projection: FEASIBLE | CONDITIONALLY_FEASIBLE → true */
  allowConfirm: boolean;
  findings: PlatformComparableFinding[];
  evaluatedAt: string;
}

/** Real ConstraintEvaluationGateway.evaluatePlan leg (optional). */
export interface GatewayContrastLeg {
  overallStatus: CanonicalOverallStatus;
  /**
   * Confirm-shaped projection. Null when overallStatus is UNVERIFIED
   * (completeness / incomplete world) — not comparable to Shadow Confirm.
   */
  allowConfirm: boolean | null;
  /** True when UNVERIFIED — do not treat as Confirm gate drift. */
  gateCompareSkipped: boolean;
  assertionConstraintTypes: string[];
  evaluationId?: string;
  /** Peer BLOCK/WARNING findings injected as guardianAssertions for ingress. */
  peerIngressAssertionCount: number;
}

export interface ContrastMappedPair {
  icelandCid: string;
  platformKey: PlatformComparableConstraintKey;
  icelandStatus: import('./iceland-initial-plan-verification.types').ConstraintAssessmentEvidence['status'];
  platformStatus: ConstraintEvaluationStatus;
  icelandBand: ContrastSeverityBand;
  platformBand: ContrastSeverityBand;
  aligned: boolean;
  dayIndex?: number;
}

export interface ShadowVsPlatformContrastReport {
  schemaId: 'tripnara.iceland_shadow_vs_platform_contrast@v1';
  fixtureId?: string;
  verificationId: string;
  proposalId: string;
  tripId: string;
  contrastedAt: string;
  iceland: {
    aggregateOutcome: import('./iceland-initial-plan-verification.types').AuthoritativeAggregateOutcome;
    status: import('./iceland-initial-plan-verification.types').AuthoritativeVerificationStatus;
    allowConfirm: boolean;
    cids: string[];
  };
  platform: {
    peerId: PlatformComparableReport['peerId'];
    overallStatus: CanonicalOverallStatus;
    allowConfirm: boolean;
    constraintKeys: string[];
    /** Present when ConstraintEvaluationGatewayService was injected and ran. */
    gateway?: GatewayContrastLeg;
  };
  mapped: ContrastMappedPair[];
  unmappedIcelandCids: string[];
  unmappedPlatformKeys: string[];
  /** allowConfirm ↔ peer.allowConfirm */
  gateAligned: boolean;
  /** allowConfirm ↔ gateway.allowConfirm when gateway ran */
  gateAlignedWithGateway?: boolean;
  /** All mapped pairs aligned (unmapped excluded). */
  mappedAligned: boolean;
  notes: string[];
  /** Filled after Apply when buildBundle contrast runs. */
  postApplyBundle?: PostApplyBundleContrast;
}
