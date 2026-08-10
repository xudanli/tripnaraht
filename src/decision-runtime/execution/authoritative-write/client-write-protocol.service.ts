/**
 * UWC-1e Preview → Confirm → Apply orchestration.
 * Preview/Confirm never call gateway.apply; Apply alone enters the write pipeline.
 */

import { Injectable, Optional } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteCommand,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { AuthoritativeWriteGatewayService } from './authoritative-write-gateway.service';
import { AuthoritativeWriteHandlerRegistryService } from './corridor-handler.registry';
import { UWC_1C_OCC_UNLOCKED } from './corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from './compensation-auth.gate';
import {
  isUwc1eTransitionAllowed,
  nextUwc1eSessionState,
  UWC_1E_STATE_MACHINE_RULES,
} from './client-write-protocol.state-machine';
import {
  attachUwc1eConfirmationAsync,
  getUwc1eProtocolSessionAsync,
  putUwc1eProtocolSessionAsync,
  updateUwc1eProtocolSessionAsync,
} from './client-write-protocol.store';
import {
  UWC_1E_APPLY_PIPELINE_STAGES,
  UWC_1E_CLIENT_OUTCOMES,
  UWC_1E_EXCLUDED_CAPABILITIES,
  UWC_1E_FIRST_BATCH_SLICES,
  UWC_1E_PRODUCT_SURFACES,
  UWC_1E_PROTOCOL_VERSION,
  UWC_1E_SCHEMA_ID,
  UWC_1E_SLICE_TO_CORRIDOR,
  type Uwc1eApplyRequest,
  type Uwc1eApplyResponse,
  type Uwc1eClientOutcome,
  type Uwc1eConfirmRequest,
  type Uwc1eConfirmResponse,
  type Uwc1eFirstBatchSlice,
  type Uwc1ePreviewRequest,
  type Uwc1ePreviewResponse,
  type Uwc1eProtocolReject,
  type Uwc1eWriteDraft,
} from './client-write-protocol.types';

const DRAFT_TTL_MS = 30 * 60 * 1000;

function isFirstBatchSlice(v: string): v is Uwc1eFirstBatchSlice {
  return (UWC_1E_FIRST_BATCH_SLICES as readonly string[]).includes(v);
}

function fingerprintDraft(input: {
  slice: string;
  tripId: string;
  expectedWriteVersion: unknown;
  intendedMutation: unknown;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        slice: input.slice,
        tripId: input.tripId,
        expectedWriteVersion: input.expectedWriteVersion,
        intendedMutation: input.intendedMutation,
      }),
    )
    .digest('hex')
    .slice(0, 32);
}

function draftSummary(slice: Uwc1eFirstBatchSlice): string {
  switch (slice) {
    case 'actions_commit':
      return 'ACTIONS_COMMIT draft (no-effect remind-class; Apply runs gates)';
    case 'itinerary_same_day_time_adjust':
      return 'ITINERARY same-day time adjust draft';
    case 'itinerary_same_day_add_item':
      return 'ITINERARY same-day ADD item draft (Arrange ADD)';
    case 'itinerary_same_day_add_from_candidates':
      return 'ITINERARY same-day ADD from candidates (AUTO_ARRANGE)';
    case 'itinerary_multi_day_add_from_candidates':
      return 'ITINERARY multi-day ADD from candidates (AUTO_ARRANGE atomic)';
    case 'itinerary_same_day_remove_item':
      return 'ITINERARY same-day REMOVE item draft';
    case 'itinerary_same_day_reorder_items':
      return 'ITINERARY same-day REORDER items draft';
    case 'itinerary_same_day_move_and_add':
      return 'ITINERARY same-day MOVE+ADD atomic composite draft';
    case 'itinerary_same_day_reduce_intensity':
      return 'ITINERARY same-day REDUCE_INTENSITY (REST+MOVE) draft';
    case 'unified_plan_version_only':
      return 'UNIFIED PlanVersion-only draft';
    }
}

@Injectable()
export class ClientWriteProtocolService {
  constructor(
    @Optional()
    private readonly gateway: AuthoritativeWriteGatewayService | null = null,
    @Optional()
    private readonly registry: AuthoritativeWriteHandlerRegistryService | null = null,
    @Optional()
    private readonly prisma: PrismaService | null = null,
  ) {}

  async preview(
    request: Uwc1ePreviewRequest,
  ): Promise<Uwc1ePreviewResponse | Uwc1eProtocolReject> {
    const baseReject = this.rejectBase('PREVIEW');
    if (request.schemaId !== UWC_1E_SCHEMA_ID) {
      return {
        ...baseReject,
        errorCode: 'PROTOCOL_VERSION_MISMATCH',
        reasonCodes: ['SCHEMA_ID_MISMATCH'],
      };
    }
    if (request.protocolVersion !== UWC_1E_PROTOCOL_VERSION) {
      return {
        ...baseReject,
        errorCode: 'PROTOCOL_VERSION_MISMATCH',
        reasonCodes: ['PROTOCOL_VERSION_MISMATCH'],
      };
    }
    if (
      !(UWC_1E_PRODUCT_SURFACES as readonly string[]).includes(
        request.productSurface,
      )
    ) {
      return {
        ...baseReject,
        errorCode: 'PRODUCT_SURFACE_MISMATCH',
        reasonCodes: ['PRODUCT_SURFACE_NOT_WEB_OR_IOS'],
      };
    }
    if (!isFirstBatchSlice(request.slice)) {
      return {
        ...baseReject,
        errorCode: 'SLICE_NOT_IN_FIRST_BATCH',
        reasonCodes: [
          'UWC_1E_FIRST_BATCH_ONLY',
          `slice=${String(request.slice)}`,
        ],
      };
    }

    const excludedHit = UWC_1E_EXCLUDED_CAPABILITIES.find(
      (c) =>
        request.intendedMutation?.[c] === true ||
        request.intendedMutation?.capability === c ||
        request.intendedMutation?.excludedCapability === c,
    );
    if (excludedHit) {
      return {
        ...baseReject,
        errorCode: 'EXCLUDED_CAPABILITY',
        reasonCodes: [
          'UWC_1E_EXCLUDED_CAPABILITY',
          excludedHit,
          'NO_MIXED_TARGETS',
          'NO_EXTERNAL_SIDE_EFFECTS',
          'NO_AUTO_COMPENSATION',
          'NO_ICELAND_MOBILE_WRITEBACK',
        ],
      };
    }

    // Hard locks — UWC-1e must not expand exclusions (mixedTargets / auto-undo / Iceland·Mobile).
    // OCC + Compensation exec unlocks (UWC-OCC-UNLOCK-01 / UWC-COMP-UNLOCK-01) coexist with 1e.
    // Client auto_compensation capability remains excluded via UWC_1E_EXCLUDED_CAPABILITIES.

    const now = Date.now();
    const corridor = UWC_1E_SLICE_TO_CORRIDOR[request.slice];
    const draft: Uwc1eWriteDraft = {
      draftId: `draft_${randomUUID()}`,
      corridor,
      slice: request.slice,
      tripId: request.tripId,
      productSurface: request.productSurface,
      fingerprint: fingerprintDraft({
        slice: request.slice,
        tripId: request.tripId,
        expectedWriteVersion: request.expectedWriteVersion,
        intendedMutation: request.intendedMutation,
      }),
      expectedWriteVersion: request.expectedWriteVersion,
      intendedMutation: { ...request.intendedMutation },
      summary: draftSummary(request.slice),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + DRAFT_TTL_MS).toISOString(),
      writesPerformed: false,
      applyPipelineEntered: false,
    };

    await putUwc1eProtocolSessionAsync({
      draft,
      state: 'DRAFT',
      mustRePreview: false,
      bypassForbidden: false,
    });

    return {
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'PREVIEW',
      sessionState: 'DRAFT',
      draft,
      reasonCodes: [
        'PREVIEW_DRAFT_ONLY',
        'APPLY_PIPELINE_NOT_ENTERED',
        'NO_AUTHORITY_VERIFICATION_OCC_HANDLER_TXN_AUDIT',
        ...UWC_1E_STATE_MACHINE_RULES.previewNeverEntersApplyPipeline
          ? ['PREVIEW_NEVER_ENTERS_APPLY_PIPELINE']
          : [],
      ],
    };
  }

  async confirm(
    request: Uwc1eConfirmRequest,
  ): Promise<Uwc1eConfirmResponse | Uwc1eProtocolReject> {
    const baseReject = this.rejectBase('CONFIRM');
    if (request.explicitConfirm !== true) {
      return {
        ...baseReject,
        errorCode: 'EXPLICIT_CONFIRM_REQUIRED',
        reasonCodes: ['EXPLICIT_CONFIRM_MUST_BE_TRUE'],
      };
    }

    const session = await getUwc1eProtocolSessionAsync(request.draftId);
    if (!session) {
      return {
        ...baseReject,
        errorCode: 'DRAFT_NOT_FOUND',
        reasonCodes: ['DRAFT_NOT_FOUND'],
      };
    }
    if (
      session.state === 'VERIFICATION_REQUIRED' ||
      session.state === 'REJECTED'
    ) {
      return {
        ...baseReject,
        errorCode: 'BYPASS_FORBIDDEN',
        reasonCodes: [
          'VERIFICATION_REQUIRED_OR_REJECTED_NO_BYPASS',
          `state=${session.state}`,
          'MUST_REPREVIEW',
        ],
        mustRePreview: true,
        bypassForbidden: true,
        sessionState: session.state,
      };
    }
    if (session.state === 'CONFLICT' || session.mustRePreview) {
      return {
        ...baseReject,
        errorCode: 'MUST_REPREVIEW_AFTER_CONFLICT',
        reasonCodes: ['CONFLICT_REQUIRES_NEW_PREVIEW'],
        mustRePreview: true,
        bypassForbidden: true,
        sessionState: session.state,
      };
    }
    if (!isUwc1eTransitionAllowed(session.state, 'CONFIRM')) {
      return {
        ...baseReject,
        errorCode: 'INVALID_SESSION_TRANSITION',
        reasonCodes: [`from=${session.state}`, 'action=CONFIRM'],
        sessionState: session.state,
      };
    }
    if (Date.parse(session.draft.expiresAt) < Date.now()) {
      return {
        ...baseReject,
        errorCode: 'DRAFT_EXPIRED',
        reasonCodes: ['DRAFT_EXPIRED'],
        mustRePreview: true,
        sessionState: session.state,
      };
    }
    if (session.draft.productSurface !== request.productSurface) {
      return {
        ...baseReject,
        errorCode: 'PRODUCT_SURFACE_MISMATCH',
        reasonCodes: [
          `draftSurface=${session.draft.productSurface}`,
          `confirmSurface=${request.productSurface}`,
        ],
        sessionState: session.state,
      };
    }

    const confirmationId = `conf_${randomUUID()}`;
    const confirmedAt = new Date().toISOString();
    await attachUwc1eConfirmationAsync(request.draftId, {
      confirmationId,
      confirmedAt,
      productSurface: request.productSurface,
    });

    return {
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'CONFIRM',
      sessionState: 'CONFIRMED',
      draftId: request.draftId,
      confirmationId,
      confirmedAt,
      reasonCodes: [
        'EXPLICIT_CONFIRM_RECORDED',
        'APPLY_PIPELINE_NOT_ENTERED',
        'CONFIRM_NEVER_ENTERS_APPLY_PIPELINE',
      ],
      applyPipelineEntered: false,
      writesPerformed: false,
    };
  }

  async apply(
    request: Uwc1eApplyRequest,
  ): Promise<Uwc1eApplyResponse | Uwc1eProtocolReject> {
    const baseReject = this.rejectBase('APPLY');
    const session = await getUwc1eProtocolSessionAsync(request.draftId);
    if (!session) {
      return {
        ...baseReject,
        errorCode: 'DRAFT_NOT_FOUND',
        reasonCodes: ['DRAFT_NOT_FOUND'],
      };
    }
    if (
      session.state === 'VERIFICATION_REQUIRED' ||
      session.state === 'REJECTED'
    ) {
      return {
        ...baseReject,
        errorCode: 'BYPASS_FORBIDDEN',
        reasonCodes: [
          session.state === 'VERIFICATION_REQUIRED'
            ? 'VERIFICATION_REQUIRED_NO_BYPASS'
            : 'REJECTED_NO_BYPASS',
          'MUST_REPREVIEW',
        ],
        mustRePreview: true,
        bypassForbidden: true,
        sessionState: session.state,
      };
    }
    if (session.state === 'CONFLICT' || session.mustRePreview) {
      return {
        ...baseReject,
        errorCode: 'MUST_REPREVIEW_AFTER_CONFLICT',
        reasonCodes: ['CONFLICT_REQUIRES_NEW_PREVIEW', 'APPLY_BLOCKED'],
        mustRePreview: true,
        bypassForbidden: true,
        sessionState: session.state,
      };
    }
    if (!isUwc1eTransitionAllowed(session.state, 'APPLY')) {
      return {
        ...baseReject,
        errorCode: 'INVALID_SESSION_TRANSITION',
        reasonCodes: [`from=${session.state}`, 'action=APPLY'],
        sessionState: session.state,
      };
    }
    if (!session.confirmationId) {
      return {
        ...baseReject,
        errorCode: 'CONFIRMATION_REQUIRED',
        reasonCodes: ['CONFIRM_BEFORE_APPLY'],
        sessionState: session.state,
      };
    }
    if (session.confirmationId !== request.confirmationId) {
      return {
        ...baseReject,
        errorCode: 'CONFIRMATION_MISMATCH',
        reasonCodes: ['CONFIRMATION_ID_MISMATCH'],
        sessionState: session.state,
      };
    }
    if (Date.parse(session.draft.expiresAt) < Date.now()) {
      return {
        ...baseReject,
        errorCode: 'DRAFT_EXPIRED',
        reasonCodes: ['DRAFT_EXPIRED'],
        mustRePreview: true,
        sessionState: session.state,
      };
    }

    const applying = nextUwc1eSessionState(session.state, 'APPLY');
    if (applying !== 'APPLYING') {
      return {
        ...baseReject,
        errorCode: 'INVALID_SESSION_TRANSITION',
        reasonCodes: ['EXPECTED_APPLYING'],
        sessionState: session.state,
      };
    }
    await updateUwc1eProtocolSessionAsync(request.draftId, { state: 'APPLYING' });

    const command = this.buildCommandFromDraft(session.draft, request);
    const gw =
      this.gateway ??
      new AuthoritativeWriteGatewayService(
        this.registry ?? new AuthoritativeWriteHandlerRegistryService(),
      );
    const writeResult = await gw.apply(command);
    const outcome = this.normalizeOutcome(writeResult.outcome);
    const terminalState = outcome as typeof outcome &
      (
        | 'APPLIED'
        | 'CONFLICT'
        | 'VERIFICATION_REQUIRED'
        | 'REJECTED'
        | 'IDEMPOTENT_REPLAY'
      );

    const mustRePreview = outcome === 'CONFLICT';
    const bypassForbidden =
      outcome === 'CONFLICT' ||
      outcome === 'VERIFICATION_REQUIRED' ||
      outcome === 'REJECTED';

    await updateUwc1eProtocolSessionAsync(request.draftId, {
      state: terminalState,
      lastOutcome: outcome,
      mustRePreview,
      bypassForbidden,
    });

    return {
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage: 'APPLY',
      sessionState: terminalState,
      draftId: request.draftId,
      confirmationId: request.confirmationId,
      outcome,
      mustRePreview,
      bypassForbidden,
      applyPipelineStages: UWC_1E_APPLY_PIPELINE_STAGES,
      writeResult,
      reasonCodes: [
        'APPLY_PIPELINE_ENTERED',
        ...UWC_1E_APPLY_PIPELINE_STAGES.map((s) => `PIPELINE_${s}`),
        ...(mustRePreview ? ['CLIENT_MUST_REPREVIEW'] : []),
        ...(bypassForbidden ? ['CLIENT_BYPASS_FORBIDDEN'] : []),
        ...writeResult.reasonCodes,
      ],
    };
  }

  private buildCommandFromDraft(
    draft: Uwc1eWriteDraft,
    request: Uwc1eApplyRequest,
  ): AuthoritativeWriteCommand {
    const registry =
      this.registry ?? new AuthoritativeWriteHandlerRegistryService();
    const handler = registry.get(draft.corridor);
    const legacy = {
      ...draft.intendedMutation,
      tripId: draft.tripId,
      trip_id: draft.tripId,
      idempotencyKey: request.idempotencyKey,
      idempotency_key: request.idempotencyKey,
      expectedWriteVersion: draft.expectedWriteVersion,
      ...(this.prisma && draft.corridor === 'ITINERARY_ADJUST'
        ? { prisma: this.prisma }
        : {}),
      ...(this.prisma && draft.corridor === 'UNIFIED_EXECUTE'
        ? { prisma: this.prisma }
        : {}),
      ...(draft.expectedWriteVersion.kind === 'PLAN_VERSION'
        ? {
            expectedPlanVersionId:
              draft.expectedWriteVersion.expectedPlanVersionId,
            observedPlanVersionId:
              draft.expectedWriteVersion.expectedPlanVersionId,
          }
        : {}),
      ...(draft.expectedWriteVersion.kind === 'RESOURCE_VERSION_SET'
        ? {
            expectedTripRevision:
              draft.expectedWriteVersion.resources[0]?.expectedVersion,
            observedTripRevision:
              draft.expectedWriteVersion.resources[0]?.expectedVersion,
            expectedResourceVersion:
              draft.expectedWriteVersion.resources[0]?.expectedVersion,
            observedResourceVersion:
              draft.expectedWriteVersion.resources[0]?.expectedVersion,
          }
        : {}),
    };

    const command = handler.buildCommand(legacy);
    return {
      ...command,
      contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
      verification: {
        kind: 'pending_draft',
        previewId: draft.draftId,
        token: request.confirmationId,
        capturedAt: new Date().toISOString(),
      },
      idempotency: {
        key: request.idempotencyKey,
        durability: command.idempotency.durability,
      },
      audit: {
        ...command.audit,
        tripId: draft.tripId,
        actorId: request.actorId ?? command.audit.actorId,
        requestId: request.requestId ?? command.audit.requestId,
        productSurface: `uwc-1e:${draft.productSurface}`,
        requestedAt: new Date().toISOString(),
      },
      expectedWriteVersion: draft.expectedWriteVersion,
      payload: {
        ...command.payload,
        legacy,
        uwc1e: {
          draftId: draft.draftId,
          confirmationId: request.confirmationId,
          slice: draft.slice,
          fingerprint: draft.fingerprint,
        },
      },
    };
  }

  private normalizeOutcome(
    outcome: AuthoritativeWriteResult['outcome'],
  ): Uwc1eClientOutcome {
    if ((UWC_1E_CLIENT_OUTCOMES as readonly string[]).includes(outcome)) {
      return outcome as Uwc1eClientOutcome;
    }
    return 'REJECTED';
  }

  private rejectBase(
    stage: 'PREVIEW' | 'CONFIRM' | 'APPLY',
  ): Omit<Uwc1eProtocolReject, 'errorCode' | 'reasonCodes'> {
    return {
      schemaId: UWC_1E_SCHEMA_ID,
      protocolVersion: UWC_1E_PROTOCOL_VERSION,
      stage,
      outcome: 'REJECTED',
      mustRePreview: false,
      bypassForbidden: false,
    };
  }
}

/** Test helper: report OCC / compensation unlock status (exclusions still held). */
export function uwc1eLocksStillHeld(): {
  globalOccUnlocked: boolean;
  compensationExecAuthorized: boolean;
} {
  return {
    globalOccUnlocked: UWC_1C_OCC_UNLOCKED,
    compensationExecAuthorized: UWC_1D_COMPENSATION_EXEC_AUTHORIZED,
  };
}

export { AUTHORITATIVE_WRITE_ERROR_CODES };
