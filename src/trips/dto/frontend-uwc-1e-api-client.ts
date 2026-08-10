/**
 * Web reference client — UWC-1e first-batch writebacks.
 * Pages use pageApi (Preview/Confirm). Shell uses commitGate (Apply only).
 *
 * Base: `{HOST}/api` + `/uwc/v1`
 */

import {
  createUwc1eClient,
  type Uwc1eClientConfig,
  type Uwc1eFetch,
} from '../../decision-runtime/execution/authoritative-write/client-write-protocol.client';
import {
  createUwc1eCommitGate,
  UWC_1E_CLIENT_COMMIT_POLICY,
} from '../../decision-runtime/execution/authoritative-write/client-write-protocol.commit-gate';
import { createUwc1ePageWriteApi } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.page-api';
import type { ExpectedWriteVersion } from '../../decision-runtime/execution/authoritative-write/expected-write-version';

export { UWC_1E_CLIENT_COMMIT_POLICY };
export { UWC_1E_IMMUTABLE_TOKEN_FIELDS } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.seal';
export { UWC_1E_PAGE_API_FORBIDDEN_METHODS } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.page-api';

export type CreateFrontendUwc1eWebClientOptions = {
  /** e.g. https://host/api */
  baseUrl: string;
  getAuthToken?: () => string | undefined;
  fetchImpl?: Uwc1eFetch;
};

function withAuth(cfg: CreateFrontendUwc1eWebClientOptions): Uwc1eClientConfig {
  return {
    baseUrl: cfg.baseUrl,
    fetchImpl: cfg.fetchImpl,
    defaultHeaders: cfg.getAuthToken
      ? {
          Authorization: `Bearer ${cfg.getAuthToken() ?? ''}`,
        }
      : undefined,
  };
}

/**
 * Web product wiring for first-batch slices:
 * - execution.remind
 * - same-day time adjustment
 * - UNIFIED PlanVersion-only
 */
export function createFrontendUwc1eWebClient(
  opts: CreateFrontendUwc1eWebClientOptions,
) {
  const raw = createUwc1eClient(withAuth(opts));
  const pageApi = createUwc1ePageWriteApi(raw, 'web');
  const commitGate = createUwc1eCommitGate(raw);

  return {
    surface: 'web' as const,
    policy: UWC_1E_CLIENT_COMMIT_POLICY,
    /** Page layer — no Apply. */
    pageApi,
    /**
     * Shell/coordinator only. Pages must not call.
     * Import path discipline enforced by contract matrix.
     */
    commitGate,
    rawClientForTestsOnly: raw,

    previewExecutionRemind(input: {
      tripId: string;
      expectedResourceVersion: string | number;
      contextSignature?: string;
      requestId?: string;
      actorId?: string;
    }) {
      const expectedWriteVersion: ExpectedWriteVersion = {
        kind: 'RESOURCE_VERSION_SET',
        resources: [
          {
            resourceId: input.tripId,
            expectedVersion: input.expectedResourceVersion,
          },
        ],
      };
      return pageApi.previewExecutionRemind({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion,
        intendedMutation: {
          request_id: input.requestId ?? `web-remind-${Date.now()}`,
          context_signature: input.contextSignature ?? 'web',
          actionType: 'execution.remind',
        },
      });
    },

    previewSameDayTimeAdjust(input: {
      tripId: string;
      expectedTripRevision: string | number;
      timeUpdates: Array<{
        itemId: string;
        startTimeIso: string;
        endTimeIso: string;
      }>;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayTimeAdjust({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          timeUpdates: input.timeUpdates,
          operation: 'same_day_time_adjust',
        },
      });
    },

    previewSameDayAddItem(input: {
      tripId: string;
      expectedTripRevision: string | number;
      itemCreates: Array<{
        tripDayId: string;
        placeId?: number | null;
        type?: string;
        startTimeIso: string;
        endTimeIso: string;
        note?: string | null;
        clientItemKey?: string;
      }>;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayAddItem({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          itemCreates: input.itemCreates,
          operation: 'same_day_add_item',
        },
      });
    },

    previewSameDayAddFromCandidates(input: {
      tripId: string;
      expectedTripRevision: string | number;
      itemCreates: Array<{
        tripDayId: string;
        placeId?: number | null;
        type?: string;
        startTimeIso: string;
        endTimeIso: string;
        note?: string | null;
        clientItemKey?: string;
      }>;
      candidateRemovals: string[];
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayAddFromCandidates({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          itemCreates: input.itemCreates,
          candidateRemovals: input.candidateRemovals,
          operation: 'same_day_add_from_candidates',
        },
      });
    },

    previewMultiDayAddFromCandidates(input: {
      tripId: string;
      expectedTripRevision: string | number;
      itemCreates: Array<{
        tripDayId: string;
        placeId?: number | null;
        type?: string;
        startTimeIso: string;
        endTimeIso: string;
        note?: string | null;
        clientItemKey?: string;
      }>;
      candidateRemovals: string[];
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewMultiDayAddFromCandidates({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          itemCreates: input.itemCreates,
          candidateRemovals: input.candidateRemovals,
          operation: 'multi_day_add_from_candidates',
        },
      });
    },

    previewSameDayRemoveItem(input: {
      tripId: string;
      expectedTripRevision: string | number;
      itemRemovals: string[];
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayRemoveItem({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          itemRemovals: input.itemRemovals,
          operation: 'same_day_remove_item',
        },
      });
    },

    previewSameDayReorderItems(input: {
      tripId: string;
      expectedTripRevision: string | number;
      itemReorders: Array<{ itemId: string; order: number }>;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayReorderItems({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          itemReorders: input.itemReorders,
          operation: 'same_day_reorder_items',
        },
      });
    },

    previewSameDayMoveAndAdd(input: {
      tripId: string;
      expectedTripRevision: string | number;
      timeUpdates: Array<{
        itemId: string;
        startTimeIso: string;
        endTimeIso: string;
      }>;
      itemCreates: Array<{
        tripDayId: string;
        placeId?: number | null;
        type?: string;
        startTimeIso: string;
        endTimeIso: string;
        note?: string | null;
        clientItemKey?: string;
      }>;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayMoveAndAdd({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          timeUpdates: input.timeUpdates,
          itemCreates: input.itemCreates,
          operation: 'same_day_move_and_add',
        },
      });
    },

    previewSameDayReduceIntensity(input: {
      tripId: string;
      expectedTripRevision: string | number;
      timeUpdates: Array<{
        itemId: string;
        startTimeIso: string;
        endTimeIso: string;
      }>;
      itemCreates: Array<{
        tripDayId: string;
        placeId?: number | null;
        type?: string;
        startTimeIso: string;
        endTimeIso: string;
        note?: string | null;
        clientItemKey?: string;
      }>;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewSameDayReduceIntensity({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        intendedMutation: {
          timeUpdates: input.timeUpdates,
          itemCreates: input.itemCreates,
          operation: 'same_day_reduce_intensity',
        },
      });
    },

    previewUnifiedPlanVersionOnly(input: {
      tripId: string;
      decisionId: string;
      planVersionId: string;
      expectedPlanVersionId: string;
      actorId?: string;
      requestId?: string;
    }) {
      return pageApi.previewUnifiedPlanVersionOnly({
        tripId: input.tripId,
        actorId: input.actorId,
        requestId: input.requestId,
        expectedWriteVersion: {
          kind: 'PLAN_VERSION',
          expectedPlanVersionId: input.expectedPlanVersionId,
        },
        intendedMutation: {
          decisionId: input.decisionId,
          planVersionId: input.planVersionId,
          operation: 'verified_plan_version_only',
        },
      });
    },
  };
}

export type FrontendUwc1eWebClient = ReturnType<
  typeof createFrontendUwc1eWebClient
>;
