/**
 * DSO → Trips 转换器
 *
 * P1: Itinerary→TripPlan、DecisionState→TripWorldState 最小可行转换
 * 策略：仅时间窗、POI 列表，供 ConstraintEngineService.isFeasible 可选调用
 *
 * 参考: docs/DECISION_KERNEL_DEV_TEAM_PLAN.md 3.3
 */

import type { DecisionState, UserIntent } from './decision-state.types';
import type { Itinerary, ItineraryDay } from '../../agent/interfaces/trip-plan.interface';
import type { TripPlan, PlanDay, PlanSlot } from '../../trips/decision/plan-model';
import type { RoutePlanDraft, RouteSegment } from '../../trips/decision/shared/world-model.types';
import type {
  TripWorldState,
  TripContextState,
  UserPreferenceProfile,
  ExternalSignalsState,
} from '../../trips/decision/world-model';

function sameLatLng(
  a?: { lat: number; lng: number } | null,
  b?: { lat: number; lng: number } | null,
): boolean {
  if (!a || !b) return false;
  return a.lat === b.lat && a.lng === b.lng;
}

function cloneCoord(c: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: c.lat, lng: c.lng };
}

/**
 * 西峡湾走廊粗粒度包络（用于审计语义：碎石/峡湾臂弯密集区），非精确行政界。
 * 约：65.05–66.45°N，24.9–20.5°W。
 */
export function isWestfjordsCorridorHeuristic(lat: number, lng: number): boolean {
  return lat >= 65.05 && lat <= 66.45 && lng >= -24.9 && lng <= -20.5;
}

const ITEM_TYPE_TO_ACTIVITY: Record<string, string> = {
  POI: 'sightseeing',
  REST: 'rest',
  MEAL: 'food',
  ACCOMMODATION: 'hotel',
  TRANSIT: 'transport',
  DRIVE: 'transport',
  WALK: 'transport',
};

/** 从 start/end window 提取 HH:mm（容错：window 可能缺失） */
function extractTime(window?: string): string {
  const m = String(window ?? '').match(/T(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/);
  if (m) {
    const h = m[1] ?? m[3] ?? '09';
    const min = m[2] ?? m[4] ?? '00';
    return `${h.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  return '09:00';
}

/**
 * Itinerary → TripPlan 最小转换
 */
export function itineraryToTripPlan(itinerary: Itinerary): TripPlan {
  const days: PlanDay[] = [];
  let slotIndex = 0;

  for (let i = 0; i < (itinerary.days?.length ?? 0); i++) {
    const day: ItineraryDay = itinerary.days![i];
    const timeSlots: PlanSlot[] = [];

    for (const item of day.items ?? []) {
      const activityType = (ITEM_TYPE_TO_ACTIVITY[item.type] ?? 'other') as PlanSlot['type'];
      // Some itineraries use start_time/end_time; others use start_window/end_window.
      const time = extractTime((item as any).start_window ?? (item as any).start_time);
      const endTime = extractTime((item as any).end_window ?? (item as any).end_time);

      timeSlots.push({
        id: item.id || `slot-${++slotIndex}`,
        time: time as any,
        endTime: endTime !== time ? (endTime as any) : undefined,
        title: item.location_ref?.name ?? item.type,
        type: activityType as any,
        poiId: item.location_ref?.place_id,
        coordinates: item.location_ref?.coordinates as any,
      });
    }

    days.push({
      day: i + 1,
      date: (day.date || '').slice(0, 10) as any,
      timeSlots,
    });
  }

  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    days,
  };
}

/**
 * Itinerary → RoutePlanDraft 最小转换（供 Fast Path 三人格使用）
 * 将 Itinerary 的 days/items 转为 RoutePlanDraft 的 segments
 *
 * endLocation：优先 `item.metadata.endLocation`；否则用**同日下一项**或**次日首项**的
 * `location_ref.coordinates` 作为相邻 POI 链推断，并置 `metadata.auto_filled_for_audit: true`
 *（供 TerrainAudit / TerminalAudit 区分「数据补全」与原始残缺输入）。
 */
export function itineraryToRoutePlanDraft(
  itinerary: Itinerary,
  tripId: string,
  routeDirectionId: string,
): RoutePlanDraft {
  const segments: RouteSegment[] = [];
  const days = itinerary.days ?? [];
  for (let dayIdx = 0; dayIdx < days.length; dayIdx++) {
    const day = days[dayIdx];
    const items = day.items ?? [];
    const nextDayFirst = days[dayIdx + 1]?.items?.[0];

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const nextItem = items[j + 1];
      const distanceM = item.metadata?.distance_meters ?? 0;

      const explicitEnd = item.metadata?.endLocation;
      let endLocation: { lat: number; lng: number } | undefined;
      let autoFilledForAudit = false;

      if (explicitEnd && typeof explicitEnd.lat === 'number' && typeof explicitEnd.lng === 'number') {
        endLocation = cloneCoord(explicitEnd);
      } else if (nextItem?.location_ref?.coordinates) {
        endLocation = cloneCoord(nextItem.location_ref.coordinates);
        autoFilledForAudit = true;
      } else if (j === items.length - 1 && nextDayFirst?.location_ref?.coordinates) {
        endLocation = cloneCoord(nextDayFirst.location_ref.coordinates);
        autoFilledForAudit = true;
      }

      const startLoc = item.location_ref?.coordinates;
      if (autoFilledForAudit && endLocation && startLoc && sameLatLng(startLoc, endLocation)) {
        endLocation = undefined;
        autoFilledForAudit = false;
      }

      const meta: Record<string, unknown> = {
        poiId: item.location_ref?.place_id,
        type: item.type,
        name: item.location_ref?.name,
        startTime: extractTime(item.start_window),
        endTime: extractTime(item.end_window),
        startLocation: item.location_ref?.coordinates,
        travelDurationMinFromPrev: (item.metadata as { travel_duration_min_from_prev?: number } | undefined)
          ?.travel_duration_min_from_prev,
      };
      if (endLocation) {
        meta.endLocation = endLocation;
      }
      if (autoFilledForAudit) {
        meta.auto_filled_for_audit = true;
        const wfStart = startLoc ? isWestfjordsCorridorHeuristic(startLoc.lat, startLoc.lng) : false;
        const wfEnd = endLocation ? isWestfjordsCorridorHeuristic(endLocation.lat, endLocation.lng) : false;
        if (wfStart || wfEnd) {
          meta.terrain_audit_trigger = 'westfjords_corridor_heuristic';
        }
      }

      segments.push({
        segmentId: item.id || `seg-${dayIdx}-${segments.length}`,
        dayIndex: dayIdx,
        distanceKm: distanceM / 1000,
        ascentM: 0,
        slopePct: 0,
        metadata: meta,
      });
    }
  }
  return { tripId, routeDirectionId, segments };
}

/**
 * UserIntent + EnvironmentState → TripContextState 最小转换
 */
function userIntentToContext(intent: UserIntent): TripContextState {
  const dest =
    typeof intent.destination === 'string'
      ? intent.destination
      : intent.destination?.lat
        ? `${intent.destination.lat},${intent.destination.lng}`
        : 'unknown';
  type DateRangeLike = { startDate?: string; endDate?: string };
  const range: DateRangeLike = intent.dateRange ?? {};
  const startDate = range.startDate ?? new Date().toISOString().slice(0, 10);
  const endDate = range.endDate ?? startDate;
  const durationDays =
    intent.days ??
    (startDate && endDate ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) : 1);

  const preferences: UserPreferenceProfile = {
    intents: {},
    pace: 'moderate',
    riskTolerance: 'medium',
  };

  return {
    destination: dest,
    startDate,
    durationDays: Math.max(1, durationDays),
    preferences,
    travelModeDefault: intent.mode === 'drive' ? 'drive' : intent.mode === 'transit' ? 'transit' : undefined,
  };
}

/**
 * DecisionState → TripWorldState 最小转换
 */
export function decisionStateToTripWorldState(state: DecisionState): TripWorldState {
  const context = userIntentToContext(state.userIntent ?? {});

  const signals: ExternalSignalsState = {
    lastUpdatedAt: new Date().toISOString(),
  };

  return {
    context,
    candidatesByDate: {},
    signals,
    policies: {
      dayStart: '08:00',
      dayEnd: '21:00',
      bufferMinBetweenActivities: 10,
    },
  };
}
