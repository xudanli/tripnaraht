/**
 * Stage 3: PERSONA-ALIGNED REARRANGEMENT — 节奏控制与人格对齐重排
 */

import { DateTime } from 'luxon';
import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { PersonaConstraintWeights, PersonaRearrangeResult } from './adaptive-replan.types';

function cloneItinerary(it: Itinerary): Itinerary {
  return {
    ...it,
    days: it.days.map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item })),
    })),
  };
}

function parseLocalTime(isoOrHm: string, dateIso: string): DateTime {
  if (/^\d{2}:\d{2}$/.test(isoOrHm)) {
    return DateTime.fromISO(`${dateIso}T${isoOrHm}`, { zone: 'Atlantic/Reykjavik' });
  }
  return DateTime.fromISO(isoOrHm, { zone: 'Atlantic/Reykjavik' });
}

function formatHm(dt: DateTime): string {
  return dt.toFormat('HH:mm');
}

function physicalCostScore(item: ItineraryItem): number {
  const duration = item.metadata?.duration_minutes ?? 90;
  const risk = item.metadata?.risk_level === 'HIGH' ? 2 : item.metadata?.risk_level === 'MEDIUM' ? 1.5 : 1;
  return duration * risk;
}

function buildRestItem(dateIso: string, window: { start: string; end: string }): ItineraryItem {
  return {
    id: `rest-${dateIso}-${window.start}`,
    type: 'REST',
    start_window: `${dateIso}T${window.start}`,
    end_window: `${dateIso}T${window.end}`,
    location_ref: { name: '休息空档' },
    evidence_refs: [],
    verified: false,
    notes: '人格对齐：leisure_chill / 高疲劳自动插入',
  };
}

export function rearrangeItineraryForPersona(params: {
  itinerary: Itinerary;
  targetDays: number[];
  weights: PersonaConstraintWeights;
}): PersonaRearrangeResult {
  const working = cloneItinerary(params.itinerary);
  const thinned_item_ids: string[] = [];
  const rationale_zh: string[] = [];
  let inserted_rest_blocks = 0;

  for (let i = 0; i < working.days.length; i++) {
    const dayNumber = i + 1;
    if (!params.targetDays.includes(dayNumber)) continue;

    const day = working.days[i];
    const poiItems = day.items.filter((it) => it.type === 'POI');

    if (poiItems.length > params.weights.maxDailyPoiCount) {
      const sorted = [...poiItems].sort((a, b) => physicalCostScore(b) - physicalCostScore(a));
      const toRemove = new Set(
        sorted.slice(params.weights.maxDailyPoiCount).map((it) => it.id),
      );
      for (const id of toRemove) {
        thinned_item_ids.push(id);
        const name = poiItems.find((p) => p.id === id)?.location_ref.name ?? id;
        rationale_zh.push(`疲劳/节奏控制：移除次要高消耗 POI「${name}」`);
      }
      day.items = day.items.filter((it) => !toRemove.has(it.id));
    }

    if (params.weights.insertRestBlock && params.weights.restBlockWindow) {
      const hasRest = day.items.some((it) => it.type === 'REST');
      if (!hasRest) {
        day.items.push(buildRestItem(day.date, params.weights.restBlockWindow));
        inserted_rest_blocks += 1;
        rationale_zh.push(`人格对齐：在 ${params.weights.restBlockWindow.start}–${params.weights.restBlockWindow.end} 插入休息空档`);
      }
    }

    const earliest = params.weights.earliestStartLocal;
    for (const item of day.items) {
      const start = parseLocalTime(item.start_window, day.date);
      const floor = parseLocalTime(earliest, day.date);
      if (start < floor) {
        const duration = parseLocalTime(item.end_window, day.date).diff(start, 'minutes').minutes;
        const newStart = floor;
        const newEnd = newStart.plus({ minutes: Math.max(duration, 30) });
        item.start_window = newStart.toISO() ?? `${day.date}T${earliest}`;
        item.end_window = newEnd.toISO() ?? item.end_window;
        rationale_zh.push(`节奏控制：「${item.location_ref.name}」不早于 ${earliest} 出发`);
      }
    }

    day.items.sort((a, b) => {
      const sa = parseLocalTime(a.start_window, day.date).toMillis();
      const sb = parseLocalTime(b.start_window, day.date).toMillis();
      return sa - sb;
    });
  }

  return {
    itinerary: working,
    inserted_rest_blocks,
    thinned_item_ids,
    rationale_zh,
  };
}
