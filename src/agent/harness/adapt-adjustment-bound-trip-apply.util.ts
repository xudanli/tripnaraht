/**
 * Adjustment Apply ↔ BoundTrip 写链桥接。
 * Confirm 后的 applyFn 委托 tryApplyBoundTripItineraryAdjustDraft，不重写走廊。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { AdjustmentDraftV1 } from './adjustment-runtime.util';
import { applyConfirmedAdjustmentDraft } from './adjustment-runtime.util';

export type BoundTripAdjustDraftApplyResult = {
  applied: boolean;
  deletedCount?: number;
  addedCount?: number;
  answerText?: string;
  targetDateIso?: string;
  reason?: string;
  appliedDays?: string[];
  skillsHit?: string[];
};

export type BoundTripAdjustDraftApplyHost = {
  tryApplyBoundTripItineraryAdjustDraft(
    tripId: string,
    userId: string | undefined,
    request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>,
  ): Promise<BoundTripAdjustDraftApplyResult>;
};

/** 供 applyConfirmedAdjustmentDraft 使用的 applyFn */
export function createBoundTripAdjustmentApplyFn(input: {
  host: BoundTripAdjustDraftApplyHost;
  tripId: string;
  userId?: string;
  request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>;
}): (
  draft: AdjustmentDraftV1,
) => Promise<{
  ok: boolean;
  actionId?: string;
  previousVersion?: string;
  newVersion?: string;
  rollbackToken?: string;
  errorZh?: string;
  boundTripResult?: BoundTripAdjustDraftApplyResult;
}> {
  return async (draft) => {
    const result = await input.host.tryApplyBoundTripItineraryAdjustDraft(
      input.tripId,
      input.userId,
      {
        ...input.request,
        trip_id: input.request.trip_id ?? input.tripId,
        message: input.request.message ?? '应用到行程',
        options: {
          ...input.request.options,
          apply_itinerary_adjust_draft: true,
        },
      },
    );
    if (!result.applied) {
      return {
        ok: false,
        errorZh: result.answerText ?? result.reason ?? 'apply_failed',
        boundTripResult: result,
      };
    }
    return {
      ok: true,
      actionId: `ITINERARY_ADJUST_DRAFT_APPLIED:${draft.draftId}`,
      previousVersion: draft.pendingRef,
      newVersion: result.targetDateIso ?? result.appliedDays?.[0],
      rollbackToken: `rb_${draft.draftId}`,
      boundTripResult: result,
    };
  };
}

/**
 * Confirmed draft → BoundTrip apply → Receipt。
 */
export async function applyConfirmedAdjustmentViaBoundTrip(input: {
  draft: AdjustmentDraftV1;
  host: BoundTripAdjustDraftApplyHost;
  tripId: string;
  userId?: string;
  request: Pick<RouteAndRunRequestDto, 'message' | 'options' | 'trip_id'>;
}): Promise<{
  draft: AdjustmentDraftV1;
  boundTripResult: BoundTripAdjustDraftApplyResult;
}> {
  let boundTripResult: BoundTripAdjustDraftApplyResult | undefined;
  const applyFn = createBoundTripAdjustmentApplyFn({
    host: {
      tryApplyBoundTripItineraryAdjustDraft: async (tripId, userId, request) => {
        const r = await input.host.tryApplyBoundTripItineraryAdjustDraft(tripId, userId, request);
        boundTripResult = r;
        return r;
      },
    },
    tripId: input.tripId,
    userId: input.userId,
    request: input.request,
  });

  const next = await applyConfirmedAdjustmentDraft(input.draft, applyFn);
  return {
    draft: next,
    boundTripResult: boundTripResult ?? {
      applied: next.status === 'APPLIED',
      reason: next.status === 'APPLIED' ? 'user_confirmed_draft_apply' : 'unknown',
    },
  };
}
