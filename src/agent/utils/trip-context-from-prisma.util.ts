/**
 * Prisma Trip 行 → PA TripContext（供 ContextAnalyzerService 槽位分析）。
 */

import type {
  TripContext,
  TripDayContext,
  TripItemContext,
} from '../assistants/trip-planner/interfaces/trip-planner.interface';

const DESTINATION_NAMES: Record<string, string> = {
  IS: '冰岛',
  JP: '日本',
  TH: '泰国',
};

export type PrismaTripRowForPaContext = {
  id: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  status?: string | null;
  budgetConfig?: unknown;
  pacingConfig?: unknown;
  metadata?: unknown;
  TripDay?: Array<{
    id: string;
    date: Date;
    theme?: string | null;
    city?: string | null;
    ItineraryItem?: Array<{
      id: string;
      type?: string | null;
      startTime?: Date | string | null;
      endTime?: Date | string | null;
      estimatedCost?: number | null;
      travelFromPreviousDuration?: number | null;
      note?: string | null;
      title?: string | null;
      name?: string | null;
      Place?: { nameCN?: string | null; nameEN?: string | null; name?: string | null } | null;
    }>;
  }>;
};

function normalizeTimeField(time: Date | string | null | undefined): string | undefined {
  if (time == null) return undefined;
  if (time instanceof Date) {
    return `${String(time.getUTCHours()).padStart(2, '0')}:${String(time.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof time === 'string' && time.includes('T')) {
    const d = new Date(time);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    }
  }
  if (typeof time === 'string' && time.includes(':')) return time.slice(0, 5);
  return undefined;
}

function mapItemType(raw: string | null | undefined): TripItemContext['type'] {
  const t = String(raw ?? 'ACTIVITY').toUpperCase();
  if (['POI', 'RESTAURANT', 'TRANSPORT', 'HOTEL', 'ACTIVITY', 'FREE_TIME'].includes(t)) {
    return t as TripItemContext['type'];
  }
  return 'ACTIVITY';
}

export function buildTripContextFromPrismaRow(trip: PrismaTripRowForPaContext): TripContext {
  const budgetConfig = (trip.budgetConfig as Record<string, unknown>) ?? {};
  const pacingConfig = (trip.pacingConfig as Record<string, unknown>) ?? {};
  const metadata = (trip.metadata as Record<string, unknown>) ?? {};

  const days: TripDayContext[] = (trip.TripDay ?? []).map((day, index) => {
    const items = day.ItineraryItem ?? [];
    const mappedItems: TripItemContext[] = items.map((item) => {
      const placeName =
        item.Place?.nameCN?.trim() ||
        item.Place?.nameEN?.trim() ||
        item.Place?.name?.trim() ||
        '';
      const name =
        placeName ||
        item.title?.trim() ||
        item.name?.trim() ||
        (item.id ? `活动 ${item.id.slice(-6)}` : '活动');
      return {
        itemId: item.id,
        type: mapItemType(item.type),
        name,
        nameCN: item.Place?.nameCN ?? undefined,
        startTime: normalizeTimeField(item.startTime),
        endTime: normalizeTimeField(item.endTime),
        duration: item.travelFromPreviousDuration ?? undefined,
        cost: item.estimatedCost ?? undefined,
        notes: item.note ?? undefined,
      };
    });

    const totalDuration = mappedItems.reduce((s, i) => s + (i.duration ?? 60), 0);

    return {
      dayId: day.id,
      dayNumber: index + 1,
      date: day.date.toISOString().slice(0, 10),
      theme: day.theme ?? undefined,
      city: day.city ?? undefined,
      items: mappedItems,
      stats: {
        itemCount: mappedItems.length,
        totalDuration,
        totalCost: mappedItems.reduce((s, i) => s + (i.cost ?? 0), 0),
        freeTime: Math.max(0, 600 - totalDuration),
        travelTime: 0,
      },
    };
  });

  const totalItems = days.reduce((s, d) => s + d.stats.itemCount, 0);
  const expectedItems = Math.max(1, days.length) * 4;
  const dest = String(trip.destination ?? '').trim();

  return {
    tripId: trip.id,
    destination: dest,
    destinationName: DESTINATION_NAMES[dest.toUpperCase()] ?? dest,
    startDate: trip.startDate.toISOString().slice(0, 10),
    endDate: trip.endDate.toISOString().slice(0, 10),
    durationDays: days.length,
    totalBudget: Number((budgetConfig as { totalBudget?: number }).totalBudget ?? 0),
    remainingBudget: Number((budgetConfig as { remaining_for_ground?: number }).remaining_for_ground ?? 0),
    travelers: {
      adults: 1,
      children: 0,
      elderly: 0,
    },
    pacingConfig: {
      level: (pacingConfig.level as TripContext['pacingConfig']['level']) ?? 'STANDARD',
      maxDailyActivities: Number(pacingConfig.maxDailyActivities ?? 5),
    },
    days,
    preferences: metadata.preferences as TripContext['preferences'],
    status: trip.status ?? 'UNKNOWN',
    completeness: Math.min(100, Math.round((totalItems / expectedItems) * 100)),
  };
}
