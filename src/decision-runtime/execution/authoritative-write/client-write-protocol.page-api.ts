/**
 * UWC-1e page-facing write API (Web + iOS TypeScript samples).
 * Preview + Confirm only — pages MUST NOT call Apply.
 */

import type { ExpectedWriteVersion } from './expected-write-version';
import type { Uwc1eSharedClient, Uwc1eClientResult } from './client-write-protocol.client';
import {
  sealConfirmHandle,
  sealPreviewFromDraft,
  type Uwc1eSealedConfirmHandle,
  type Uwc1eSealedPreviewHandle,
} from './client-write-protocol.seal';
import type {
  Uwc1eFirstBatchSlice,
  Uwc1eProductSurface,
  Uwc1eProtocolReject,
} from './client-write-protocol.types';

export type Uwc1ePagePreviewInput = {
  tripId: string;
  actorId?: string;
  requestId?: string;
  expectedWriteVersion: ExpectedWriteVersion;
  intendedMutation: Record<string, unknown>;
};

export type Uwc1ePageResult<T> =
  | { ok: true; handle: T }
  | {
      ok: false;
      mustRePreview: boolean;
      bypassForbidden: boolean;
      error: Uwc1eProtocolReject | { outcome?: string; mustRePreview?: boolean };
    };

function mapFail(
  client: Uwc1eSharedClient,
  result: Uwc1eClientResult<unknown>,
): Uwc1ePageResult<never> {
  return {
    ok: false,
    mustRePreview: client.mustRePreview(result),
    bypassForbidden: client.bypassForbidden(result),
    error: result.body as Uwc1eProtocolReject,
  };
}

/**
 * Page shell API — shared by Web and iOS reference clients.
 * No `apply` method by design.
 */
export function createUwc1ePageWriteApi(
  client: Uwc1eSharedClient,
  productSurface: Uwc1eProductSurface,
) {
  async function previewSlice(
    slice: Uwc1eFirstBatchSlice,
    input: Uwc1ePagePreviewInput,
  ): Promise<Uwc1ePageResult<Uwc1eSealedPreviewHandle>> {
    const result = await client.preview({
      productSurface,
      slice,
      tripId: input.tripId,
      actorId: input.actorId,
      requestId: input.requestId,
      intendedMutation: input.intendedMutation,
      expectedWriteVersion: input.expectedWriteVersion,
    });
    if (!result.ok || !('draft' in result.body)) {
      return mapFail(client, result);
    }
    return {
      ok: true,
      handle: sealPreviewFromDraft(result.body.draft),
    };
  }

  return {
    productSurface,
    /** Pages: Preview only. */
    previewExecutionRemind(input: Uwc1ePagePreviewInput) {
      return previewSlice('actions_commit', {
        ...input,
        intendedMutation: {
          actionType: 'execution.remind',
          ...input.intendedMutation,
        },
      });
    },
    /** Pages: Preview only — same-day time adjust. */
    previewSameDayTimeAdjust(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_time_adjust', input);
    },
    /** Pages: Preview only — same-day ADD item (Arrange ADD). */
    previewSameDayAddItem(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_add_item', input);
    },
    /** Pages: Preview only — same-day ADD from candidates (AUTO_ARRANGE). */
    previewSameDayAddFromCandidates(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_add_from_candidates', input);
    },
    /** Pages: Preview only — multi-day ADD from candidates (atomic AUTO_ARRANGE). */
    previewMultiDayAddFromCandidates(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_multi_day_add_from_candidates', input);
    },
    /** Pages: Preview only — same-day REMOVE item. */
    previewSameDayRemoveItem(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_remove_item', input);
    },
    /** Pages: Preview only — same-day REORDER items. */
    previewSameDayReorderItems(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_reorder_items', input);
    },
    /** Pages: Preview only — same-day MOVE+ADD atomic composite. */
    previewSameDayMoveAndAdd(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_move_and_add', input);
    },
    /** Pages: Preview only — same-day REDUCE_INTENSITY (REST ADD + MOVE). */
    previewSameDayReduceIntensity(input: Uwc1ePagePreviewInput) {
      return previewSlice('itinerary_same_day_reduce_intensity', input);
    },
    /** Pages: Preview only — PlanVersion-only UNIFIED. */
    previewUnifiedPlanVersionOnly(input: Uwc1ePagePreviewInput) {
      return previewSlice('unified_plan_version_only', input);
    },
    /** Pages: explicit Confirm only. */
    async confirm(
      preview: Uwc1eSealedPreviewHandle,
      opts?: { actorId?: string; requestId?: string },
    ): Promise<Uwc1ePageResult<Uwc1eSealedConfirmHandle>> {
      if (preview.productSurface !== productSurface) {
        return {
          ok: false,
          mustRePreview: true,
          bypassForbidden: true,
          error: {
            schemaId: 'tripnara.uwc_client_write_protocol@v1',
            protocolVersion: '1.0.0',
            stage: 'CONFIRM',
            outcome: 'REJECTED',
            errorCode: 'PRODUCT_SURFACE_MISMATCH',
            reasonCodes: ['PAGE_SURFACE_MISMATCH'],
            mustRePreview: true,
            bypassForbidden: true,
          },
        };
      }
      const result = await client.confirm({
        draftId: preview.draftId,
        productSurface,
        actorId: opts?.actorId,
        requestId: opts?.requestId,
      });
      if (!result.ok || !('confirmationId' in result.body)) {
        return mapFail(client, result);
      }
      return {
        ok: true,
        handle: sealConfirmHandle(
          preview,
          result.body.confirmationId,
          result.body.confirmedAt,
        ),
      };
    },
  };
}

export type Uwc1ePageWriteApi = ReturnType<typeof createUwc1ePageWriteApi>;

/** Compile-time / contract guard: page API must not expose apply. */
export type Uwc1ePageWriteApiKeys = keyof Uwc1ePageWriteApi;
export const UWC_1E_PAGE_API_FORBIDDEN_METHODS = ['apply', 'commit', 'authoritativeApply'] as const;
