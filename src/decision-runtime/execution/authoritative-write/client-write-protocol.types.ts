/**
 * UWC-1e — Web/iOS shared Preview → Confirm → Apply protocol.
 *
 * Preview: draft only.
 * Confirm: explicit confirmation record only.
 * Apply: Authority → Verification → Idempotency → OCC → Handler → Transaction → Audit.
 *
 * Does not flip global OCC / Compensation / corridor AUTHORITATIVE scope.
 */

import type {
  AuthoritativeWriteCorridorId,
  AuthoritativeWriteOutcome,
  AuthoritativeWriteResult,
  UnifiedWriteProtocolStage,
} from './authoritative-write.types';
import type { ExpectedWriteVersion } from './expected-write-version';

export const UWC_1E_PROTOCOL_VERSION = '1.0.0' as const;
export const UWC_1E_SCHEMA_ID = 'tripnara.uwc_client_write_protocol@v1' as const;

/** Shared client surfaces — one OpenAPI for both. */
export const UWC_1E_PRODUCT_SURFACES = ['web', 'ios'] as const;
export type Uwc1eProductSurface = (typeof UWC_1E_PRODUCT_SURFACES)[number];

/**
 * First-batch slices only (cutover-approved scopes).
 * Expanding this list requires a new explicit decision — not UWC-1e.
 */
export const UWC_1E_FIRST_BATCH_SLICES = [
  'actions_commit',
  'itinerary_same_day_time_adjust',
  'itinerary_same_day_add_item',
  'itinerary_same_day_add_from_candidates',
  'itinerary_multi_day_add_from_candidates',
  'itinerary_same_day_remove_item',
  'itinerary_same_day_reorder_items',
  'itinerary_same_day_move_and_add',
  'itinerary_same_day_reduce_intensity',
  'unified_plan_version_only',
] as const;

export type Uwc1eFirstBatchSlice = (typeof UWC_1E_FIRST_BATCH_SLICES)[number];

export const UWC_1E_SLICE_TO_CORRIDOR: Record<
  Uwc1eFirstBatchSlice,
  AuthoritativeWriteCorridorId
> = {
  actions_commit: 'ACTIONS_COMMIT',
  itinerary_same_day_time_adjust: 'ITINERARY_ADJUST',
  itinerary_same_day_add_item: 'ITINERARY_ADJUST',
  itinerary_same_day_add_from_candidates: 'ITINERARY_ADJUST',
  itinerary_multi_day_add_from_candidates: 'ITINERARY_ADJUST',
  itinerary_same_day_remove_item: 'ITINERARY_ADJUST',
  itinerary_same_day_reorder_items: 'ITINERARY_ADJUST',
  itinerary_same_day_move_and_add: 'ITINERARY_ADJUST',
  itinerary_same_day_reduce_intensity: 'ITINERARY_ADJUST',
  unified_plan_version_only: 'UNIFIED_EXECUTE',
};

/** Explicit exclusions — clients must not send these as slices. */
export const UWC_1E_EXCLUDED_CAPABILITIES = [
  'mixedTargets',
  'external_side_effects',
  'auto_compensation',
  'iceland_writeback',
  'mobile_writeback',
] as const;

/** Apply-only pipeline (never Preview / Confirm). */
export const UWC_1E_APPLY_PIPELINE_STAGES = [
  'AUTHORITY',
  'VERIFICATION',
  'IDEMPOTENCY',
  'OCC',
  'HANDLER',
  'TRANSACTION',
  'AUDIT',
] as const;

export type Uwc1eApplyPipelineStage =
  (typeof UWC_1E_APPLY_PIPELINE_STAGES)[number];

/** Terminal / shared result enum — Web and iOS identical. */
export const UWC_1E_CLIENT_OUTCOMES = [
  'APPLIED',
  'CONFLICT',
  'VERIFICATION_REQUIRED',
  'REJECTED',
  'IDEMPOTENT_REPLAY',
] as const satisfies readonly AuthoritativeWriteOutcome[];

export type Uwc1eClientOutcome = (typeof UWC_1E_CLIENT_OUTCOMES)[number];

/** Protocol session state machine (shared). */
export const UWC_1E_SESSION_STATES = [
  'IDLE',
  'DRAFT',
  'CONFIRMED',
  'APPLYING',
  'APPLIED',
  'CONFLICT',
  'VERIFICATION_REQUIRED',
  'REJECTED',
  'IDEMPOTENT_REPLAY',
] as const;

export type Uwc1eSessionState = (typeof UWC_1E_SESSION_STATES)[number];

export type Uwc1eClientAction =
  | 'PREVIEW'
  | 'CONFIRM'
  | 'APPLY'
  | 'ACK_CONFLICT_REPREVIEW';

export type Uwc1ePreviewRequest = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'PREVIEW';
  productSurface: Uwc1eProductSurface;
  slice: Uwc1eFirstBatchSlice;
  tripId: string;
  actorId?: string;
  /** Corridor-local intended mutation (opaque). Never executed at Preview. */
  intendedMutation: Record<string, unknown>;
  expectedWriteVersion: ExpectedWriteVersion;
  /** Optional observed versions for draft fingerprint (OCC still Apply-only). */
  observedHints?: Record<string, unknown>;
  requestId?: string;
};

export type Uwc1eWriteDraft = {
  draftId: string;
  corridor: AuthoritativeWriteCorridorId;
  slice: Uwc1eFirstBatchSlice;
  tripId: string;
  productSurface: Uwc1eProductSurface;
  fingerprint: string;
  expectedWriteVersion: ExpectedWriteVersion;
  intendedMutation: Record<string, unknown>;
  summary: string;
  createdAt: string;
  expiresAt: string;
  /** Preview never touches these. */
  writesPerformed: false;
  applyPipelineEntered: false;
};

export type Uwc1ePreviewResponse = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'PREVIEW';
  sessionState: 'DRAFT';
  draft: Uwc1eWriteDraft;
  reasonCodes: string[];
};

export type Uwc1eConfirmRequest = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'CONFIRM';
  draftId: string;
  /** Must be true — silence / implied consent rejected. */
  explicitConfirm: true;
  productSurface: Uwc1eProductSurface;
  actorId?: string;
  requestId?: string;
};

export type Uwc1eConfirmResponse = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'CONFIRM';
  sessionState: 'CONFIRMED';
  draftId: string;
  confirmationId: string;
  confirmedAt: string;
  reasonCodes: string[];
  /** Confirm never enters Apply pipeline. */
  applyPipelineEntered: false;
  writesPerformed: false;
};

export type Uwc1eApplyRequest = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'APPLY';
  draftId: string;
  confirmationId: string;
  idempotencyKey: string;
  productSurface: Uwc1eProductSurface;
  actorId?: string;
  requestId?: string;
};

export type Uwc1eApplyResponse = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: 'APPLY';
  sessionState: Uwc1eSessionState;
  draftId: string;
  confirmationId: string;
  outcome: Uwc1eClientOutcome;
  /** Client MUST re-Preview when true (CONFLICT). */
  mustRePreview: boolean;
  /** Client MUST NOT bypass / retry Apply when true. */
  bypassForbidden: boolean;
  applyPipelineStages: readonly Uwc1eApplyPipelineStage[];
  writeResult: AuthoritativeWriteResult;
  reasonCodes: string[];
};

export type Uwc1eProtocolErrorCode =
  | 'SLICE_NOT_IN_FIRST_BATCH'
  | 'EXCLUDED_CAPABILITY'
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_EXPIRED'
  | 'INVALID_SESSION_TRANSITION'
  | 'EXPLICIT_CONFIRM_REQUIRED'
  | 'CONFIRMATION_MISMATCH'
  | 'CONFIRMATION_REQUIRED'
  | 'MUST_REPREVIEW_AFTER_CONFLICT'
  | 'BYPASS_FORBIDDEN'
  | 'PRODUCT_SURFACE_MISMATCH'
  | 'PROTOCOL_VERSION_MISMATCH';

export type Uwc1eProtocolReject = {
  schemaId: typeof UWC_1E_SCHEMA_ID;
  protocolVersion: typeof UWC_1E_PROTOCOL_VERSION;
  stage: UnifiedWriteProtocolStage;
  outcome: 'REJECTED';
  errorCode: Uwc1eProtocolErrorCode;
  reasonCodes: string[];
  mustRePreview: boolean;
  bypassForbidden: boolean;
  sessionState?: Uwc1eSessionState;
};
