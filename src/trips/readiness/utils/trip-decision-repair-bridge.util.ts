import { DateTime } from 'luxon';
import type { TripPlan, PlanDay, PlanSlot } from '../../decision/plan-model';
import type { ActivityType, ISODate, ISOTime, TripWorldState } from '../../decision/world-model';
import type { DecisionTrigger } from '../../decision/decision-log';
import { applyPrismaTripIdToWorldState } from '../../execution-closure-persistence/apply-prisma-trip-id-to-world-state';
import {
  applyAuthorityDecisionScopeSignalsToWorldSignals,
  readAuthorityDecisionScopeSignalsFromMetadata,
} from '../../guardian-decision-core/orchestration/authority-decision-scope-signals.util';

export interface PrismaTripPlace {
  id: number;
  nameEN: string | null;
  nameCN: string | null;
  category: string;
  metadata: unknown;
}

export interface PrismaTripItineraryItem {
  id: string;
  type: string;
  placeId: number | null;
  startTime: Date | null;
  endTime: Date | null;
  note: string | null;
  Place?: PrismaTripPlace | null;
}

export interface PrismaTripDay {
  id: string;
  date: Date;
  ItineraryItem: PrismaTripItineraryItem[];
}

export interface PrismaTripWithDays {
  id: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  TripDay: PrismaTripDay[];
  /** Optional — when present, authority DecisionScope signals are applied to world state. */
  metadata?: unknown;
}

function formatISOTime(value: Date | null | undefined): ISOTime | undefined {
  if (!value) return undefined;
  return DateTime.fromJSDate(value).toFormat('HH:mm') as ISOTime;
}

function extractCoordinates(place?: PrismaTripPlace | null) {
  const metadata = (place?.metadata ?? {}) as Record<string, unknown>;
  const direct = metadata.coordinates as { lat?: number; lng?: number } | undefined;
  if (direct && typeof direct.lat === 'number' && typeof direct.lng === 'number') {
    return { lat: direct.lat, lng: direct.lng };
  }
  if (typeof metadata.lat === 'number' && typeof metadata.lng === 'number') {
    return { lat: metadata.lat, lng: metadata.lng };
  }
  return undefined;
}

function mapActivityType(item: PrismaTripItineraryItem): ActivityType {
  const category = (item.Place?.category || '').toLowerCase();
  if (category.includes('hotel')) return 'hotel';
  if (category.includes('restaurant') || category.includes('food')) return 'food';
  if (category.includes('museum')) return 'museum';
  if (item.type === 'TRANSPORT') return 'transport';
  return 'sightseeing';
}

export function buildTripPlanFromPrismaTrip(trip: PrismaTripWithDays): TripPlan {
  const days: PlanDay[] = trip.TripDay.map((day, index) => {
    const items = [...day.ItineraryItem].sort((a, b) => {
      const ta = a.startTime?.getTime() ?? 0;
      const tb = b.startTime?.getTime() ?? 0;
      return ta - tb;
    });

    const timeSlots: PlanSlot[] = items
      .filter((item) => item.type === 'ACTIVITY' || item.placeId)
      .map((item) => ({
        id: item.id,
        time: formatISOTime(item.startTime) || ('09:00' as ISOTime),
        endTime: formatISOTime(item.endTime),
        title: item.Place?.nameCN || item.Place?.nameEN || item.note || 'Activity',
        type: mapActivityType(item),
        poiId: item.placeId ? String(item.placeId) : undefined,
        coordinates: extractCoordinates(item.Place),
      }));

    return {
      day: index + 1,
      date: DateTime.fromJSDate(day.date).toISODate() as ISODate,
      timeSlots,
    };
  });

  return {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    tripId: trip.id,
    days,
  };
}

export function buildTripWorldStateFromPrismaTrip(trip: PrismaTripWithDays): TripWorldState {
  const startDate = DateTime.fromJSDate(trip.startDate).toISODate() as ISODate;
  const durationDays = Math.max(
    1,
    Math.floor(
      DateTime.fromJSDate(trip.endDate).diff(DateTime.fromJSDate(trip.startDate), 'days').days,
    ) + 1,
  );

  const baseSignals: Record<string, unknown> = {
    lastUpdatedAt: new Date().toISOString(),
  };
  const authorityBinding = readAuthorityDecisionScopeSignalsFromMetadata(trip.metadata);
  const signals = applyAuthorityDecisionScopeSignalsToWorldSignals(
    baseSignals,
    authorityBinding,
  );

  const state = {
    context: {
      tripId: trip.id,
      destination: trip.destination,
      startDate,
      durationDays,
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate: {},
    signals,
  } as TripWorldState;

  applyPrismaTripIdToWorldState(state, trip.id);
  return state;
}

export function mapReadinessActionToDecisionTrigger(actionType: string): DecisionTrigger {
  switch (actionType) {
    case 'fetch_weather':
      return 'weather_update';
    case 'check_road':
    case 'find_alternative_route':
      return 'traffic_change';
    case 'reorder_pois':
    case 'move_to_day':
    case 'remove_pois':
    case 'adjust_time':
    case 'replace_poi':
    case 'book_transport':
      return 'manual_repair';
    default:
      return 'signal_update';
  }
}

export const READINESS_DECISION_ENGINE_PATH = '/api/decision-engine/v1/repair-plan';

/** Readiness / feasibility Plan B 修复动作 — 必须经 TripDecisionEngine.repairPlan 执行 */
export const DECISION_ENGINE_REPAIR_ACTIONS = new Set([
  'reorder_pois',
  'move_to_day',
  'remove_pois',
  'book_transport',
  'find_alternative_route',
  'contact_guide',
  'change_hotel',
  'search_nearby',
  'change_destination',
  'buy_insurance',
  'adjust_time',
  'replace_poi',
]);

export function isDecisionEngineRepairAction(actionType: string | undefined | null): boolean {
  if (!actionType) return false;
  return DECISION_ENGINE_REPAIR_ACTIONS.has(actionType);
}
