import { DateTime } from 'luxon';
import {
  MCPOI_BENCHMARK_POI_CATALOG,
  MCPOI_BENCHMARK_TRIP_DAYS,
  type McpoiMemberId,
  type McpoiScheduledItem,
} from '../../arrange-itinerary/fixtures/multi-constraint-poi-arrangement-benchmark.fixture';
import type { PlanProposalChange } from '../../arrange-itinerary/types/plan-proposal.types';

const NOTE_TO_POI: Record<string, string> = Object.fromEntries(
  Object.values(MCPOI_BENCHMARK_POI_CATALOG).map((p) => [p.name, p.poiId]),
);

NOTE_TO_POI['Glacier Hike'] = 'POI-GLACIER-HIKE';
NOTE_TO_POI['Visitor Center + 午餐 + 室内休息'] = 'POI-VISITOR-CENTER';

export interface McpoiDbItineraryItem {
  id: string;
  type: string;
  note: string | null;
  startTime: Date | null;
  endTime: Date | null;
  order: number | null;
}

export interface McpoiDbTripDay {
  id: string;
  date: Date;
  dayNumber: number;
  items: McpoiDbItineraryItem[];
}

function resolvePoiId(note: string | null | undefined): string | undefined {
  if (!note) return undefined;
  const trimmed = note.trim();
  if (NOTE_TO_POI[trimmed]) return NOTE_TO_POI[trimmed];
  for (const [name, poiId] of Object.entries(NOTE_TO_POI)) {
    if (trimmed.includes(name)) return poiId;
  }
  return undefined;
}

function mapDbItemType(
  type: string,
  note: string | null,
): McpoiScheduledItem['type'] {
  if (type === 'TRANSIT') return 'TRANSIT';
  if (type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING') return 'MEAL';
  if (type === 'REST') return 'HOTEL';
  if (note?.includes('午餐') || note?.includes('晚餐')) return 'MEAL';
  if (note?.includes('酒店')) return 'HOTEL';
  if (note?.includes('出发') || note?.includes('会合')) return 'TRANSIT';
  return 'ACTIVITY';
}

function formatHm(date: Date | null, fallbackDayDate: string): string {
  if (!date) return '09:00';
  const dt = DateTime.fromJSDate(date, { zone: 'Atlantic/Reykjavik' });
  return dt.toFormat('HH:mm');
}

export function dbDaysToMcpoiScheduledByDayIndex(
  days: McpoiDbTripDay[],
): Map<number, McpoiScheduledItem[]> {
  const out = new Map<number, McpoiScheduledItem[]>();
  for (const day of days) {
    const dayIndex =
      MCPOI_BENCHMARK_TRIP_DAYS.find((d) => d.id === day.id)?.dayIndex ??
      Math.max(0, day.dayNumber - 1);
    const dayDate =
      MCPOI_BENCHMARK_TRIP_DAYS[dayIndex]?.date ??
      DateTime.fromJSDate(day.date).toISODate() ??
      '2026-10-04';

    const items: McpoiScheduledItem[] = day.items
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => {
        const memberIds = inferMemberIdsFromNote(item.note);
        return {
          itemId: item.id,
          poiId: resolvePoiId(item.note),
          label: item.note?.trim() || '行程项',
          startTime: formatHm(item.startTime, dayDate),
          endTime: formatHm(item.endTime, dayDate),
          type: mapDbItemType(item.type, item.note),
          memberIds,
        };
      });

    if (items.length > 0) out.set(dayIndex, items);
  }
  return out;
}

function inferMemberIdsFromNote(note: string | null): McpoiMemberId[] | undefined {
  if (!note) return undefined;
  if (note.includes('Visitor Center') && note.includes('午餐')) {
    return ['M4', 'M5'];
  }
  if (note === 'Glacier Hike') {
    return ['M1', 'M2', 'M3'];
  }
  return undefined;
}

export function applyProposalChangesToDayItems(
  items: McpoiScheduledItem[],
  changes: PlanProposalChange[],
  dayIndex: number,
): McpoiScheduledItem[] {
  let out = items.map((i) => ({ ...i }));
  for (const change of changes.filter((c) => c.dayIndex === dayIndex)) {
    if (change.operation === 'REMOVE' && change.itemId) {
      out = out.filter((i) => i.itemId !== change.itemId);
      continue;
    }
    if (change.operation === 'MOVE' && change.itemId) {
      out = out.map((i) =>
        i.itemId === change.itemId
          ? {
              ...i,
              startTime: extractHm(change.to ?? change.startTime ?? i.startTime),
              endTime: extractHm(change.endTime ?? i.endTime),
            }
          : i,
      );
    }
  }
  return out;
}

function extractHm(value: string): string {
  const match = value.match(/(\d{1,2}:\d{2})/);
  return match?.[1] ?? value;
}
