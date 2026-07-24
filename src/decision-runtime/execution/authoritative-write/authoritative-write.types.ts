/**
 * Unified Writeback Contract v1 — shared command / result / error model.
 *
 * Scope: minimum safety contract for authoritative write corridors.
 * NOT a global SSOT, Proposal unification bus, or single persistence store.
 *
 * @see MIXED_WRITE_UNIFICATION_FORBIDDEN
 * @see evidence/work-packages/UWC-01-unified-writeback-contract/
 */

import { MIXED_WRITE_UNIFICATION_FORBIDDEN } from '../../../agent/contracts/writeback-corridor-audit.matrix';

export const AUTHORITATIVE_WRITE_CONTRACT_VERSION = '1.0.0' as const;

export { MIXED_WRITE_UNIFICATION_FORBIDDEN };

/** First-batch corridors only. Iceland/Mobile/OR-Tools Apply excluded. */
export const AUTHORITATIVE_WRITE_V1_CORRIDORS = [
  'ITINERARY_ADJUST',
  'UNIFIED_EXECUTE',
  'ACTIONS_COMMIT',
] as const;

export type AuthoritativeWriteCorridorId =
  (typeof AUTHORITATIVE_WRITE_V1_CORRIDORS)[number];

/** Maps product corridor id → writeback audit matrix row id. */
export const CORRIDOR_TO_AUDIT_ROW_ID: Record<
  AuthoritativeWriteCorridorId,
  'itinerary_adjust_apply' | 'unified_execute' | 'actions_commit'
> = {
  ITINERARY_ADJUST: 'itinerary_adjust_apply',
  UNIFIED_EXECUTE: 'unified_execute',
  ACTIONS_COMMIT: 'actions_commit',
};

/**
 * Logical write targets. Mixed corridors list multiple refs;
 * do not collapse into one store.
 */
export type WriteTargetKind =
  | 'trip_itinerary_item'
  | 'plan_version'
  | 'effective_plan'
  | 'decision_ledger'
  | 'problem_store'
  | 'side_effect'
  | 'agent_action_log'
  | 'trip_metadata'
  | 'in_memory_dedup';

export type WriteTargetRef = {
  kind: WriteTargetKind;
  /** Optional mixed-target id from WRITEBACK_CORRIDOR_AUDIT_MATRIX */
  mixedTargetId?: string;
  durability?: 'always' | 'flag_gated' | 'optional' | 'in_memory' | 'response_only';
};

/** Authority credential for this write (corridor-local shape allowed). */
export type WriteAuthorityProof = {
  /** ALLOW required to proceed past gateway authority stage */
  verdict: 'ALLOW' | 'DENY';
  reasonCodes: string[];
  /** e.g. authorize record, execution_mode, EffectivePlanWriteGuard scope */
  source: string;
  decisionId?: string;
  expiresAt?: string;
};

/** Preview → Confirm verification (signature, authorize token, draft bound). */
export type VerificationProof = {
  kind:
    | 'context_signature'
    | 'authorize_record'
    | 'pending_draft'
    | 'mutation_authority_envelope'
    | 'none_required';
  token?: string;
  previewId?: string;
  capturedAt?: string;
};

/**
 * Optimistic concurrency / freshness hints (corridor-local).
 * UWC-1c OCC SSOT is `expectedWriteVersion` (discriminated), NOT these optional strings
 * and NOT global TravelContext version.
 */
export type FreshnessProof = {
  /** @deprecated for OCC — use expectedWriteVersion.kind=PLAN_VERSION */
  basePlanVersionId?: string;
  /** @deprecated for OCC — use expectedWriteVersion.kind=RESOURCE_VERSION_SET */
  contextVersion?: string | number;
  tripRevision?: number;
  expectedEffectivePlanVersionId?: string;
  /** Corridor-local opaque token (e.g. Actions context_signature TTL window) */
  corridorFreshnessToken?: string;
};

export type IdempotencyProof = {
  key: string;
  /** durable preferred; in_memory accepted only for ACTIONS until upgraded */
  durability: 'durable' | 'in_memory' | 'request_scoped';
};

export type AuthoritativeWriteAuditContext = {
  tripId: string;
  actorId?: string;
  requestId?: string;
  correlationId?: string;
  productSurface: string;
  /** ISO-8601 */
  requestedAt: string;
};

/**
 * Dual-layer rollback model (v1):
 * - pre_commit: abort transaction / fail before effective
 * - post_effective: create compensating PlanVersion (no hotel/activity/car external compensation)
 */
export type WriteCompensationModel =
  | 'pre_commit_abort'
  | 'post_effective_compensating_plan_version'
  | 'revision_chain_rollback'
  | 'stub_no_side_effects';

export type AuthoritativeWriteCommand = {
  schemaId: 'tripnara.authoritative_write_command@v1';
  contractVersion: typeof AUTHORITATIVE_WRITE_CONTRACT_VERSION;
  corridor: AuthoritativeWriteCorridorId;
  writeTargets: WriteTargetRef[];
  authority: WriteAuthorityProof;
  verification: VerificationProof;
  freshness: FreshnessProof;
  /**
   * UWC-1c OCC contract — discriminated expected write object version.
   * Required for shadow capture / future authoritative path.
   */
  expectedWriteVersion: import('./expected-write-version').ExpectedWriteVersion;
  /** Observed at capture time (shadow pre-write); must match expected.kind */
  observedWriteVersion?: import('./expected-write-version').ObservedWriteVersion;
  idempotency: IdempotencyProof;
  audit: AuthoritativeWriteAuditContext;
  compensationModel: WriteCompensationModel;
  /**
   * Opaque corridor payload — gateway does not interpret;
   * adapter forwards to existing executor.
   */
  payload: Record<string, unknown>;
};

/** Unified client/protocol outcomes (Preview → Confirm → Apply). */
export type AuthoritativeWriteOutcome =
  | 'APPLIED'
  | 'CONFLICT'
  | 'VERIFICATION_REQUIRED'
  | 'REJECTED'
  | 'IDEMPOTENT_REPLAY';

export const AUTHORITATIVE_WRITE_ERROR_CODES = {
  AUTHORITY_DENIED: 'AUTHORITY_DENIED',
  VERIFICATION_REQUIRED: 'VERIFICATION_REQUIRED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',
  FRESHNESS_CONFLICT: 'FRESHNESS_CONFLICT',
  BASE_PLAN_VERSION_STALE: 'BASE_PLAN_VERSION_STALE',
  CONTEXT_VERSION_CONFLICT: 'CONTEXT_VERSION_CONFLICT',
  IDEMPOTENCY_KEY_MISSING: 'IDEMPOTENCY_KEY_MISSING',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  TRANSACTION_ABORTED: 'TRANSACTION_ABORTED',
  HANDLER_NOT_BOUND: 'HANDLER_NOT_BOUND',
  CORRIDOR_NOT_IN_V1_BATCH: 'CORRIDOR_NOT_IN_V1_BATCH',
  WRITE_TARGET_MISMATCH: 'WRITE_TARGET_MISMATCH',
  AUDIT_CONTEXT_INCOMPLETE: 'AUDIT_CONTEXT_INCOMPLETE',
  COMPENSATION_UNSUPPORTED: 'COMPENSATION_UNSUPPORTED',
  FORBIDDEN_CAPABILITY: 'FORBIDDEN_CAPABILITY',
  ALREADY_APPLIED: 'ALREADY_APPLIED',
  OCC_KIND_MISMATCH: 'OCC_KIND_MISMATCH',
} as const;

export type AuthoritativeWriteErrorCode =
  (typeof AUTHORITATIVE_WRITE_ERROR_CODES)[keyof typeof AUTHORITATIVE_WRITE_ERROR_CODES];

export type AuthoritativeWriteResult = {
  schemaId: 'tripnara.authoritative_write_result@v1';
  contractVersion: typeof AUTHORITATIVE_WRITE_CONTRACT_VERSION;
  outcome: AuthoritativeWriteOutcome;
  corridor: AuthoritativeWriteCorridorId;
  errorCode?: AuthoritativeWriteErrorCode;
  reasonCodes: string[];
  writeTargetsTouched: WriteTargetRef[];
  idempotencyKey: string;
  /** Effective / revision ids when applied */
  appliedRefs?: {
    planVersionId?: string;
    tripRevision?: number;
    itineraryRevisionId?: string;
  };
  auditRecordId?: string;
  /** Corridor-native payload echo (HTTP adapters map to existing DTOs) */
  corridorResult?: Record<string, unknown>;
};

/** Explicit product protocol stages for Web/iOS (post gateway). */
export const UNIFIED_WRITE_PROTOCOL_STAGES = [
  'PREVIEW',
  'CONFIRM',
  'APPLY',
] as const;

export type UnifiedWriteProtocolStage =
  (typeof UNIFIED_WRITE_PROTOCOL_STAGES)[number];

/** Hard prohibitions for this train — do not implement behind UWC. */
export const UWC_V1_FORBIDDEN = [
  'global_travelcontext_ssot',
  'proposal_unification',
  'microservice_cqrs_graphql_redesign',
  'ortools_authoritative_apply',
  'iceland_mobile_writeback_expansion',
  'external_commercial_compensation_hotel_activity_car',
  'mixed_write_single_store_unification',
] as const;
