/**
 * ITINERARY_ADJUST「应用到行程」：将待确认草案 trip.applyEdit 落库目标日。
 */

import type { ItineraryDay, ItineraryItem } from '../interfaces/trip-plan.interface';
import type { TripUserEdit } from '../../skills/trip/utils/trip-user-edit.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  buildCorridorDayApplyEdits,
  parseNumericPlaceId,
  pickTargetDayFromItinerary,
} from './itinerary-adjust-corridor-apply.util';
import {
  resolvePlaceIdFromTripItems,
  type TripLikeForDelete,
} from './itinerary-item-delete.util';
import type { PendingItineraryAdjustDraft } from './itinerary-adjust-pending-draft.util';

export const ITINERARY_ADJUST_APPLY_INTENT_RE =
  /应用到(?:正式)?行程|确认应用(?:该)?草案|应用(?:至|到)行程|apply\s+(?:to\s+)?itinerary/i;

export function detectItineraryAdjustDraftApplyIntent(
  message: string,
  options?: { apply_itinerary_adjust_draft?: boolean },
): boolean {
  if (options?.apply_itinerary_adjust_draft === true) return true;
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  return ITINERARY_ADJUST_APPLY_INTENT_RE.test(t);
}

export function buildItineraryAdjustDraftApplyAnswerText(params: {
  applied: boolean;
  targetDateIso: string;
  dayNumber?: number;
  deletedCount?: number;
  addedCount?: number;
  reason?: string;
}): string {
  const dayLabel =
    params.dayNumber != null
      ? `第 ${params.dayNumber} 天`
      : params.targetDateIso;
  if (params.applied) {
    return `已将${dayLabel}（${params.targetDateIso}）更新为确认后的草案日程；左侧时间轴已同步，其余日期未改动。`;
  }
  if (params.reason === 'unresolved_places') {
    return `未能写入${dayLabel}：部分景点缺少可落库的地点信息，请稍后在时间轴上手动调整时段。`;
  }
  if (params.reason === 'day_not_found') {
    return `未能找到${params.targetDateIso} 对应的行程日，请确认 Trip 日期范围。`;
  }
  if (params.reason === 'no_pending_draft') {
    return '未找到待应用的改排草案，请重新生成草案后再点击「应用到行程」。';
  }
  return `未能将草案写入正式行程（${params.reason ?? 'unknown'}），请重试或手动调整。`;
}

export type ItineraryAdjustDraftApplyResult = {
  applied: boolean;
  reason?: string;
  answerText?: string;
  deletedCount?: number;
  addedCount?: number;
  targetDateIso?: string;
  skillsHit?: string[];
};

export async function executeItineraryAdjustDraftApply(params: {
  tripId: string;
  userId?: string;
  pending: PendingItineraryAdjustDraft;
  loadTrip: () => Promise<TripLikeForDelete>;
  resolvePlaceId: (item: ItineraryItem, researchPools?: unknown[][]) => number | undefined;
  applyEditSkill: {
    execute: (input: {
      mode: 'db';
      tripId: string;
      edits: TripUserEdit[];
    }) => Promise<{ success?: boolean }>;
  };
  researchPools?: unknown[][];
}): Promise<ItineraryAdjustDraftApplyResult> {
  const targetDateIso = params.pending.target_date_iso.slice(0, 10);
  const targetDay: ItineraryDay = {
    date: targetDateIso,
    items: params.pending.itinerary_day.items ?? [],
  };

  let trip: TripLikeForDelete;
  try {
    trip = await params.loadTrip();
  } catch {
    return {
      applied: false,
      reason: 'trip_load_failed',
      answerText: buildItineraryAdjustDraftApplyAnswerText({
        applied: false,
        targetDateIso,
        dayNumber: params.pending.target_day_number,
        reason: 'trip_load_failed',
      }),
    };
  }

  const placeIdCache = new Map<string, number>();
  const resolvePlaceId = (item: ItineraryItem): number | undefined => {
    const fromRef = parseNumericPlaceId(item.location_ref?.place_id);
    if (fromRef != null) return fromRef;
    const key = String(item.location_ref?.place_id ?? item.location_ref?.name ?? item.id);
    if (placeIdCache.has(key)) return placeIdCache.get(key);
    let resolved = params.resolvePlaceId(item, params.researchPools);
    if (resolved == null) {
      const name = String(item.location_ref?.name ?? '').trim();
      if (name) {
        resolved = resolvePlaceIdFromTripItems(trip, name, targetDateIso);
      }
    }
    if (resolved != null) placeIdCache.set(key, resolved);
    return resolved;
  };

  const picked = pickTargetDayFromItinerary({ days: [targetDay] }, targetDateIso);
  if (!picked?.items?.length) {
    return {
      applied: false,
      reason: 'empty_draft_day',
      targetDateIso,
      answerText: buildItineraryAdjustDraftApplyAnswerText({
        applied: false,
        targetDateIso,
        dayNumber: params.pending.target_day_number,
        reason: 'empty_draft_day',
      }),
    };
  }

  const { edits, deleteIds, addCount, unresolvedItems } = buildCorridorDayApplyEdits({
    trip,
    targetDateIso,
    targetDay: picked,
    resolvePlaceId,
  });

  if (addCount === 0 || unresolvedItems.length > 0) {
    return {
      applied: false,
      reason: 'unresolved_places',
      targetDateIso,
      answerText: buildItineraryAdjustDraftApplyAnswerText({
        applied: false,
        targetDateIso,
        dayNumber: params.pending.target_day_number,
        reason: 'unresolved_places',
      }),
    };
  }

  try {
    const out = await params.applyEditSkill.execute({
      mode: 'db',
      tripId: params.tripId.trim(),
      edits: edits as TripUserEdit[],
    });
    if (out?.success) {
      return {
        applied: true,
        targetDateIso,
        deletedCount: deleteIds.length,
        addedCount: addCount,
        skillsHit: ['trip.applyEdit'],
        answerText: buildItineraryAdjustDraftApplyAnswerText({
          applied: true,
          targetDateIso,
          dayNumber: params.pending.target_day_number,
          deletedCount: deleteIds.length,
          addedCount: addCount,
        }),
      };
    }
  } catch {
    // fall through
  }

  return {
    applied: false,
    reason: 'apply_failed',
    targetDateIso,
    answerText: buildItineraryAdjustDraftApplyAnswerText({
      applied: false,
      targetDateIso,
      dayNumber: params.pending.target_day_number,
      reason: 'apply_failed',
    }),
  };
}
