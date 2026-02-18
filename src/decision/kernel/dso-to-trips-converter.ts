/**
 * DSO → Trips 转换器
 *
 * P1: Itinerary→TripPlan、DecisionState→TripWorldState 最小可行转换
 * 策略：仅时间窗、POI 列表，供 ConstraintEngineService.isFeasible 可选调用
 *
 * 参考: docs/DECISION_KERNEL_DEV_TEAM_PLAN.md 3.3
 */

import type { DecisionState, UserIntent } from './decision-state.types';
import type { Itinerary, ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { TripPlan, PlanDay, PlanSlot } from '../../trips/decision/plan-model';
import type { RoutePlanDraft, RouteSegment } from '../../trips/decision/shared/world-model.types';
import type {
  TripWorldState,
  TripContextState,
  UserPreferenceProfile,
  ExternalSignalsState,
  ActivityCandidate,
} from '../../trips/decision/world-model';

const ITEM_TYPE_TO_ACTIVITY: Record<string, string> = {
  POI: 'sightseeing',
  REST: 'rest',
  MEAL: 'food',
  ACCOMMODATION: 'hotel',
  TRANSIT: 'transport',
  DRIVE: 'transport',
  WALK: 'transport',
};

/** 从 start_window 提取 HH:mm */
function extractTime(window: string): string {
  const m = window.match(/T(\d{2}):(\d{2})|(\d{1,2}):(\d{2})/);
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
      const time = extractTime(item.start_window);
      const endTime = extractTime(item.end_window);

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
 */
export function itineraryToRoutePlanDraft(
  itinerary: Itinerary,
  tripId: string,
  routeDirectionId: string,
): RoutePlanDraft {
  const segments: RouteSegment[] = [];
  for (let dayIdx = 0; dayIdx < (itinerary.days?.length ?? 0); dayIdx++) {
    const day = itinerary.days![dayIdx];
    for (const item of day.items ?? []) {
      const distanceM = (item.metadata as any)?.distance_meters ?? 0;
      segments.push({
        segmentId: item.id || `seg-${dayIdx}-${segments.length}`,
        dayIndex: dayIdx,
        distanceKm: distanceM / 1000,
        ascentM: 0,
        slopePct: 0,
        metadata: {
          poiId: item.location_ref?.place_id,
          type: item.type,
          name: item.location_ref?.name,
        },
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
