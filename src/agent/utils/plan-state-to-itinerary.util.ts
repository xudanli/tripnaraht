import type { Itinerary, ItineraryItem } from '../interfaces/trip-plan.interface';
import type { PlanContext, PlanState } from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import { collectSegmentStops } from './planning-workbench-execute-enrich.util';

function resolveCountryCode(context: PlanContext): string {
  const raw = context.destination?.country?.trim() ?? '';
  const upper = raw.toUpperCase();
  if (upper.length === 2) return upper;
  if (upper.includes('ICELAND') || raw.includes('冰岛')) return 'IS';
  if (context.destination?.region?.toUpperCase().includes('IS')) return 'IS';
  return 'IS';
}

function dateForDay(startDate: string | undefined, dayIndex: number): string {
  if (startDate?.trim()) {
    const base = new Date(startDate.trim().slice(0, 10));
    if (!Number.isNaN(base.getTime())) {
      base.setUTCDate(base.getUTCDate() + dayIndex);
      return base.toISOString().slice(0, 10);
    }
  }
  return `1970-01-${String(dayIndex + 1).padStart(2, '0')}`;
}

function segmentToItems(segment: RouteSegment, dayIndex: number): ItineraryItem[] {
  const metadata = (segment.metadata ?? {}) as Record<string, unknown>;
  const stops = collectSegmentStops(metadata);
  const fallbackNames = [
    metadata.primaryPoiTitle,
    metadata.theme,
    metadata.name,
    metadata.fromName,
    metadata.toName,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim());

  const names = stops.length > 0 ? stops : [...new Set(fallbackNames)];

  if (names.length === 0) {
    return [];
  }

  return names.map((name, idx) => ({
    id: `${segment.segmentId}_item_${idx}`,
    type: 'POI' as const,
    start_window: idx === 0 ? '09:00' : `${10 + idx}:00`,
    end_window: idx === 0 ? '12:00' : `${12 + idx}:00`,
    location_ref: { name },
    evidence_refs: [],
    verified: false,
    metadata: {
      slot_source: 'heuristic',
      time_source: 'heuristic',
    },
  }));
}

/**
 * Planning Workbench PlanState → Itinerary（供 CTRE compile 输入）。
 */
export function planStateToItinerary(params: {
  planState: PlanState;
  context: PlanContext;
  requestId?: string;
}): Itinerary {
  const { planState, context } = params;
  const segments = planState.itinerary?.segments ?? [];
  const startDate = planState.constraints?.time?.startDate;

  const dayIndices = [...new Set(segments.map((s) => s.dayIndex))].sort((a, b) => a - b);
  const days =
    dayIndices.length > 0
      ? dayIndices.map((dayIndex) => ({
          date: dateForDay(startDate, dayIndex),
          items: segments
            .filter((s) => s.dayIndex === dayIndex)
            .flatMap((s) => segmentToItems(s, dayIndex)),
        }))
      : [];

  return {
    request_id: params.requestId ?? planState.plan_id,
    days: days.filter((d) => d.items.length > 0),
    metadata: {
      total_days: days.length,
      source: 'planning_workbench_plan_state@v0',
    },
  };
}

export function resolveWorkbenchCountryCode(context: PlanContext): string {
  return resolveCountryCode(context);
}
