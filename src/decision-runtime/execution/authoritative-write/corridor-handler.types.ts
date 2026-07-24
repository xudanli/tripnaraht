/**
 * Explicit corridor handler contract (UWC-1b).
 * Shadow path: gates + write-target resolution + reconcile only — zero writes.
 */

import type {
  AuthoritativeWriteCommand,
  AuthoritativeWriteCorridorId,
  AuthoritativeWriteOutcome,
  AuthoritativeWriteResult,
  WriteTargetRef,
} from './authoritative-write.types';
import type { CorridorWriteMode } from './corridor-write-mode.config';

export type ShadowGateStage =
  | 'authority'
  | 'verification'
  | 'freshness'
  | 'idempotency'
  | 'write_targets'
  | 'audit'
  | 'compensation_model';

export type ShadowGateCheck = {
  stage: ShadowGateStage;
  pass: boolean;
  detail: string;
};

export type ShadowValidateReport = {
  schemaId: 'tripnara.uwc_shadow_validate_report@v1';
  corridor: AuthoritativeWriteCorridorId;
  mode: CorridorWriteMode;
  /** Always true for shadow handlers — contract assertion aid */
  sideEffectsForbidden: true;
  writesPerformed: false;
  gateChecks: ShadowGateCheck[];
  resolvedWriteTargets: WriteTargetRef[];
  predictedOutcome: AuthoritativeWriteOutcome;
  reasonCodes: string[];
  command: AuthoritativeWriteCommand;
};

export type LegacyWriteSnapshot = {
  /** Corridor-native success signal */
  legacyApplied: boolean;
  legacyOutcomeHint?: AuthoritativeWriteOutcome;
  reasonCodes?: string[];
  refs?: {
    planVersionId?: string;
    tripRevision?: number;
    itineraryRevisionId?: string;
  };
  raw?: Record<string, unknown>;
};

export type ShadowReconcileDiff = {
  schemaId: 'tripnara.uwc_shadow_reconcile_diff@v1';
  corridor: AuthoritativeWriteCorridorId;
  match: boolean;
  predictedOutcome: AuthoritativeWriteOutcome;
  legacyOutcome: AuthoritativeWriteOutcome;
  divergences: string[];
  writeTargets: WriteTargetRef[];
  recordedAt: string;
};

export type CorridorShadowHandler = {
  readonly corridor: AuthoritativeWriteCorridorId;
  readonly delegatePath: string;
  readonly delegateSymbol: string;
  /** Build command from legacy request context (no I/O). */
  buildCommand(input: Record<string, unknown>): AuthoritativeWriteCommand;
  /**
   * Shadow validate only. MUST NOT call DB writers, side-effect registries,
   * PlanVersion setEffective, or external APIs.
   */
  shadowValidate(command: AuthoritativeWriteCommand): ShadowValidateReport;
  /**
   * Authoritative apply — hard-blocked until UWC-1c.
   * Implementations must throw UWC_AUTHORITATIVE_HARD_BLOCK_REASON.
   */
  authoritativeApply(
    command: AuthoritativeWriteCommand,
  ): Promise<AuthoritativeWriteResult>;
};
