import type { Itinerary, ItineraryItem, TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import {
  PLANNER_DRAFT_IR_SCHEMA_ID,
  type PlannerDraftDay,
  type PlannerDraftIR,
  type PlannerDraftSlot,
  type PlannerSlotHintType,
  type PlannerTimeHint,
} from '../contracts/planner-draft-ir.types';
import { inferSlotHintFromText } from '../resolution/route-template-matcher.util';

function mapItemTypeToHint(type: ItineraryItem['type']): PlannerSlotHintType {
  switch (type) {
    case 'POI':
      return 'poi';
    case 'ACCOMMODATION':
      return 'stay';
    case 'DRIVE':
    case 'WALK':
    case 'TRANSIT':
      return 'transport';
    case 'REST':
    case 'MEAL':
      return 'meal';
    default:
      return 'unknown';
  }
}

function inferTimeHint(startWindow: string | undefined): PlannerTimeHint | undefined {
  if (!startWindow) return undefined;
  const t = startWindow.trim();
  const hhmm = t.length <= 5 ? t : t.slice(11, 16);
  const hour = Number.parseInt(hhmm.slice(0, 2), 10);
  if (Number.isNaN(hour)) return t;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function itemToSlot(
  item: ItineraryItem,
  dayIndex: number,
  slotIndex: number,
  countryCode: string,
): PlannerDraftSlot {
  const name = item.location_ref?.name?.trim() || item.notes?.trim() || item.type;
  const baseHint = mapItemTypeToHint(item.type);
  const routeHint = inferSlotHintFromText(name, countryCode);
  return {
    slotId: item.id || `day${dayIndex}_slot${slotIndex}`,
    rawText: name,
    timeHint: inferTimeHint(item.start_window),
    hintType: routeHint ?? baseHint,
    evidenceRefs: item.evidence_refs?.length ? [...item.evidence_refs] : undefined,
    metadata: {
      itineraryItemType: item.type,
      startWindow: item.start_window,
      endWindow: item.end_window,
      placeId: item.location_ref?.place_id,
    },
  };
}

function resolveCountryCode(tripPlanRequest?: TripPlanRequest): string {
  const dest = tripPlanRequest?.destination;
  if (typeof dest === 'string' && dest.trim()) {
    const upper = dest.trim().toUpperCase();
    if (upper.length === 2) return upper;
    if (upper.includes('ICELAND') || upper.includes('冰岛')) return 'IS';
  }
  const country = (tripPlanRequest as { country_code?: string } | undefined)?.country_code;
  if (country?.trim()) return country.trim().toUpperCase();
  return 'IS';
}

function resolveDestinationDisplay(tripPlanRequest?: TripPlanRequest): string | undefined {
  const dest = tripPlanRequest?.destination;
  return typeof dest === 'string' ? dest : undefined;
}

export function itineraryToPlannerDraftIR(params: {
  itinerary: Itinerary;
  tripPlanRequest?: TripPlanRequest;
  tripId?: string;
  source?: PlannerDraftIR['source'];
}): PlannerDraftIR {
  const { itinerary, tripPlanRequest, tripId, source = 'agent_planner' } = params;
  const countryCode = resolveCountryCode(tripPlanRequest);
  const days: PlannerDraftDay[] = (itinerary.days ?? []).map((day, dayIndex) => ({
    dayIndex,
    date: day.date,
    slots: (day.items ?? []).map((item, slotIndex) => itemToSlot(item, dayIndex, slotIndex, countryCode)),
  }));

  return {
    schemaId: PLANNER_DRAFT_IR_SCHEMA_ID,
    compileRequestId: itinerary.request_id,
    tripId,
    requestId: itinerary.request_id,
    source,
    destination: {
      countryCode,
      displayName: resolveDestinationDisplay(tripPlanRequest),
    },
    days,
    createdAt: new Date().toISOString(),
  };
}
