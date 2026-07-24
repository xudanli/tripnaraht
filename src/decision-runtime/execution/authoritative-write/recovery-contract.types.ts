/**
 * UWC-1d — two-layer recovery / compensation contract.
 *
 * Layer 1: TRANSACTION_ABORT — fail before effective; unwind in-flight txn only.
 * Layer 2: POST_EFFECTIVE_COMPENSATING_WRITE — reverse-diff against *current* version.
 *
 * Forbidden:
 * - universal Rollback bus
 * - restore / overwrite from an old snapshot (silent history rewrite)
 */

import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';
import type { ExpectedWriteVersion, ObservedWriteVersion } from './expected-write-version';

export const UWC_RECOVERY_CONTRACT_VERSION = '1.0.0' as const;

export const RECOVERY_LAYERS = [
  'TRANSACTION_ABORT',
  'POST_EFFECTIVE_COMPENSATING_WRITE',
] as const;

export type RecoveryLayer = (typeof RECOVERY_LAYERS)[number];

/** What a corridor may do for recovery. */
export type RecoveryCapability =
  | 'NO_EFFECTIVE_SIDE_EFFECT'
  | 'REVERSE_DIFF_INTERNAL'
  | 'EXTERNAL_COMPENSATION_UNSUPPORTED';

export const UWC_RECOVERY_FORBIDDEN = [
  'UNIVERSAL_ROLLBACK_BUS',
  'RESTORE_OLD_SNAPSHOT',
  'SILENT_HISTORY_REWRITE',
  'CROSS_CORRIDOR_COMPENSATION_PLATFORM',
] as const;

export type UwcRecoveryForbidden = (typeof UWC_RECOVERY_FORBIDDEN)[number];

/** Internal objects eligible for reverse-diff writes. */
export const INTERNAL_REVERSE_WRITE_TARGETS = [
  'PlanVersion',
  'Trip',
  'ItineraryItem',
] as const;

export type InternalReverseWriteTarget =
  (typeof INTERNAL_REVERSE_WRITE_TARGETS)[number];

/** External commercial surfaces — always unsupported in UWC-1d. */
export const EXTERNAL_COMPENSATION_SURFACES = [
  'hotel_order',
  'activity_booking',
  'car_rental',
  'refund',
  'ticketing',
  'payment_capture',
] as const;

export type ExternalCompensationSurface =
  (typeof EXTERNAL_COMPENSATION_SURFACES)[number];

/**
 * Reverse diff is computed against the *current* write object version.
 * Never a byte-restore of a historical snapshot.
 */
export type CompensationReverseDiff = {
  schemaId: 'tripnara.compensation_reverse_diff@v1';
  basedOnCurrentVersion: ExpectedWriteVersion;
  /** Opaque reverse ops — corridor adapter interprets; not a snapshot blob */
  reverseOps: ReadonlyArray<Record<string, unknown>>;
  internalTargets: ReadonlyArray<InternalReverseWriteTarget>;
  /** Declared external surfaces touched by original write (all unsupported) */
  externalSurfacesTouched: ReadonlyArray<ExternalCompensationSurface>;
};

export type CompensationCommand = {
  schemaId: 'tripnara.compensation_command@v1';
  contractVersion: typeof UWC_RECOVERY_CONTRACT_VERSION;
  corridor: AuthoritativeWriteCorridorId;
  layer: RecoveryLayer;
  /** Original write idempotency key (for audit linkage) */
  originalIdempotencyKey: string;
  /** Dedicated compensation idempotency key */
  compensationIdempotencyKey: string;
  authorityVerdict: 'ALLOW' | 'DENY';
  authorityReasonCodes: string[];
  verificationToken?: string;
  /**
   * Expected current version at compensate time.
   * If observed diverges → COMPENSATION_CONFLICT (do not overwrite later edits).
   */
  expectedCurrentVersion: ExpectedWriteVersion;
  observedCurrentVersion: ObservedWriteVersion;
  reverseDiff: CompensationReverseDiff;
  audit: {
    tripId: string;
    requestedAt: string;
    actorId?: string;
    reason: string;
  };
};

export type CompensationOutcome =
  | 'ABORTED_PRE_EFFECTIVE'
  | 'COMPENSATION_APPLIED'
  | 'COMPENSATION_CONFLICT'
  | 'ALREADY_APPLIED'
  | 'REJECTED'
  | 'EXTERNAL_UNSUPPORTED'
  | 'NOT_AUTHORIZED'
  | 'NO_EFFECT';

export type CompensationDecision = {
  schemaId: 'tripnara.compensation_decision@v1';
  outcome: CompensationOutcome;
  reasonCodes: string[];
  corridor: AuthoritativeWriteCorridorId;
  layer: RecoveryLayer;
  /** Always false under Shadow / when exec gate closed */
  writesPerformed: boolean;
  stages: ReadonlyArray<{
    stage:
      | 'recovery_profile'
      | 'forbidden_pattern'
      | 'compensation_auth_gate'
      | 'authority'
      | 'verification'
      | 'idempotency'
      | 'occ'
      | 'atomic_write'
      | 'audit';
    pass: boolean;
    detail: string;
  }>;
};
