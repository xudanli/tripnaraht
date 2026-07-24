/**
 * 分流方案 — 从持久化行程加载 Schedule 真源
 */

import type { PrismaService } from '../../../prisma/prisma.service';
import { sortItineraryItemsForDayDisplay } from '../../../itinerary-items/utils/itinerary-day-display-order.util';
import { resolvePlaceDisplayName } from '../../../places/utils/place-display-name.util';
import {
  coordsFromPlaceMetadata,
  loadPlaceCoordinatesMap,
} from './split-plan-place-coords.util';
import { DateTime } from 'luxon';

export type SplitPlanScheduleItemIntensity = 'high' | 'medium' | 'low';

export type SplitPlanScheduleItem = {
  id: string;
  tripDayId: string;
  dayNumber: number;
  dayIndex: number;
  type: string;
  /** 活动/节点名 */
  title: string;
  /** POI 地点名 */
  placeName?: string;
  subtitle?: string;
  startTime?: string;
  endTime?: string;
  startMs: number;
  endMs: number;
  intensity: SplitPlanScheduleItemIntensity;
  riskLevel: 'low' | 'medium' | 'high';
  costPerPerson?: string;
  placeLabel?: string;
  trailId?: number | null;
  travelDurationMin?: number;
  estimatedCost?: number | null;
  currency?: string | null;
  note?: string | null;
  placeId?: number | null;
  lat?: number;
  lng?: number;
};

export type SplitPlanMemberRef = {
  id: string;
  displayName: string;
  avatarUrl?: string;
};

export type SplitPlanMemberCluster = {
  groupA: { memberIds: string[]; label: string; members?: SplitPlanMemberRef[] };
  groupB: { memberIds: string[]; label: string; members?: SplitPlanMemberRef[] };
};

export type SplitPlanScheduleSource = {
  tripId: string;
  days: Array<{
    tripDayId: string;
    dayNumber: number;
    dayIndex: number;
    dateLabel?: string;
    items: SplitPlanScheduleItem[];
  }>;
  memberCluster?: SplitPlanMemberCluster;
  totalMemberCount: number;
};

type ItemRow = {
  id: string;
  tripDayId: string;
  placeId: number | null;
  type: string;
  startTime: Date | null;
  endTime: Date | null;
  order: number | null;
  note: string | null;
  trailId: number | null;
  travelFromPreviousDuration: number | null;
  estimatedCost: number | null;
  currency: string | null;
  Place: {
    nameCN: string | null;
    nameEN: string | null;
    address: string | null;
    metadata?: unknown;
  } | null;
  Trail: {
    distanceKm: number | null;
    elevationGainM: number | null;
    averageSlope: number | null;
  } | null;
};

const HIGH_PACE_STYLES = new Set([
  'SPONTANEOUS_ADVENTURER',
  'EXPERIENCE_SEEKER',
  'RATIONAL_EXPLORER',
]);

function formatHm(date: Date | null, fallbackDay: Date): string | undefined {
  if (!date) return undefined;
  const dt = DateTime.fromJSDate(date);
  if (!dt.isValid) return undefined;
  return dt.toFormat('HH:mm');
}

function resolvePlaceName(place: ItemRow['Place']): string {
  return resolvePlaceDisplayName(place);
}

function isInternalNote(note: string | null | undefined): boolean {
  const t = note?.trim() ?? '';
  if (!t) return true;
  return /^\[(timelineDisplayRole|split):/i.test(t) || t.startsWith('模板推荐的');
}

function resolveActivityTitle(item: ItemRow, placeName: string): string {
  const note = item.note?.trim();
  if (note && !isInternalNote(note)) return note.slice(0, 80);

  switch (item.type) {
    case 'ACTIVITY':
      return item.trailId != null ? '徒步活动' : '游览活动';
    case 'TRANSIT':
      return '转场';
    case 'REST':
      return '休息';
    case 'MEAL_ANCHOR':
    case 'MEAL_FLOATING':
      return '用餐';
    default:
      return placeName;
  }
}

function inferIntensity(item: ItemRow): SplitPlanScheduleItemIntensity {
  if (item.type === 'REST') return 'low';
  if (item.type === 'MEAL_ANCHOR' || item.type === 'MEAL_FLOATING') return 'low';

  const ascent = item.Trail?.elevationGainM ?? 0;
  const slope = item.Trail?.averageSlope ?? 0;
  const travelMin = item.travelFromPreviousDuration ?? 0;
  const distanceKm = item.Trail?.distanceKm ?? 0;

  if (item.trailId != null && (ascent >= 300 || slope >= 15 || distanceKm >= 8)) return 'high';
  if (item.trailId != null && (ascent >= 100 || distanceKm >= 4)) return 'medium';
  if (travelMin >= 90) return 'high';
  if (travelMin >= 45) return 'medium';
  if (item.type === 'ACTIVITY') return 'medium';
  return 'low';
}

function inferRiskLevel(intensity: SplitPlanScheduleItemIntensity): 'low' | 'medium' | 'high' {
  if (intensity === 'high') return 'medium';
  return 'low';
}

function formatCostPerPerson(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string | undefined {
  if (typeof amount !== 'number' || amount <= 0) return undefined;
  const cur = currency ?? 'CNY';
  const symbol = cur === 'CNY' ? '¥' : cur === 'USD' ? '$' : `${cur} `;
  return `${symbol}${Math.round(amount)}/人`;
}

function mapScheduleItem(
  item: ItemRow,
  dayNumber: number,
  dayIndex: number,
  tripDayId: string,
  dayDate: Date,
): SplitPlanScheduleItem {
  const placeName = resolvePlaceName(item.Place);
  const title = resolveActivityTitle(item, placeName);
  const startMs = item.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const endMs = item.endTime?.getTime() ?? startMs;
  const intensity = inferIntensity(item);
  const metaCoords = coordsFromPlaceMetadata(item.Place?.metadata);

  return {
    id: item.id,
    tripDayId,
    dayNumber,
    dayIndex,
    type: item.type,
    title,
    placeName,
    subtitle: item.Place?.address?.trim() || undefined,
    startTime: formatHm(item.startTime, dayDate),
    endTime: formatHm(item.endTime, dayDate),
    startMs,
    endMs,
    intensity,
    riskLevel: inferRiskLevel(intensity),
    costPerPerson: formatCostPerPerson(item.estimatedCost, item.currency),
    placeLabel: placeName,
    placeId: item.placeId,
    lat: metaCoords?.lat,
    lng: metaCoords?.lng,
    trailId: item.trailId,
    travelDurationMin: item.travelFromPreviousDuration ?? undefined,
    estimatedCost: item.estimatedCost,
    currency: item.currency,
    note: item.note,
  };
}

export async function loadSplitPlanScheduleSource(
  prisma: PrismaService,
  tripId: string,
  memberCluster?: SplitPlanMemberCluster,
): Promise<SplitPlanScheduleSource | null> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      TripDay: {
        orderBy: { date: 'asc' },
        include: {
          ItineraryItem: {
            include: {
              Place: {
                select: {
                  nameCN: true,
                  nameEN: true,
                  address: true,
                  metadata: true,
                },
              },
              Trail: {
                select: {
                  distanceKm: true,
                  elevationGainM: true,
                  averageSlope: true,
                },
              },
            },
          },
        },
      },
      TripCollaborator: { select: { userId: true } },
    },
  });

  if (!trip || trip.TripDay.length === 0) return null;

  const days = trip.TripDay.map((day, dayIndex) => {
    const sorted = sortItineraryItemsForDayDisplay(day.ItineraryItem as ItemRow[]);
    const dayNumber = dayIndex + 1;
    return {
      tripDayId: day.id,
      dayNumber,
      dayIndex,
      dateLabel: DateTime.fromJSDate(day.date).toFormat('yyyy-MM-dd'),
      items: sorted.map((item) =>
        mapScheduleItem(item as ItemRow, dayNumber, dayIndex, day.id, day.date),
      ),
    };
  });

  const placeIds = days.flatMap((d) =>
    d.items.map((i) => i.placeId).filter((id): id is number => typeof id === 'number' && id > 0),
  );
  const coordMap = await loadPlaceCoordinatesMap(prisma, placeIds);
  for (const day of days) {
    for (const item of day.items) {
      if (item.lat != null && item.lng != null) continue;
      const pid = item.placeId;
      if (pid == null) continue;
      const c = coordMap.get(pid);
      if (c) {
        item.lat = c.lat;
        item.lng = c.lng;
      }
    }
  }

  const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
  const memberIds = new Set(trip.TripCollaborator.map((c) => c.userId));
  if (ownerId) memberIds.add(ownerId);

  return {
    tripId,
    days,
    memberCluster,
    totalMemberCount: memberCluster
      ? memberCluster.groupA.memberIds.length + memberCluster.groupB.memberIds.length
      : memberIds.size,
  };
}

export async function loadMemberClusterForSplit(
  prisma: PrismaService,
  tripId: string,
): Promise<SplitPlanMemberCluster | undefined> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { TripCollaborator: { select: { userId: true } } },
  });
  if (!trip) return undefined;

  const memberIds = new Set(trip.TripCollaborator.map((c) => c.userId));
  const ownerId = (trip.metadata as { userId?: string } | null)?.userId;
  if (ownerId) memberIds.add(ownerId);
  const ids = [...memberIds];
  if (ids.length < 2) return undefined;

  const [users, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true, avatarUrl: true },
    }),
    prisma.userDecisionProfilingProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, travelStyleCard: true },
    }),
  ]);

  const groupAIds: string[] = [];
  const groupBIds: string[] = [];

  for (const userId of ids) {
    const raw = profiles.find((p) => p.userId === userId)?.travelStyleCard;
    const styleType =
      raw && typeof raw === 'object' && typeof (raw as { styleType?: string }).styleType === 'string'
        ? (raw as { styleType: string }).styleType
        : undefined;
    if (styleType && HIGH_PACE_STYLES.has(styleType)) {
      groupAIds.push(userId);
    } else {
      groupBIds.push(userId);
    }
  }

  if (groupAIds.length === 0 && groupBIds.length > 0) {
    groupAIds.push(groupBIds.pop()!);
  }
  if (groupBIds.length === 0 && groupAIds.length > 1) {
    groupBIds.push(groupAIds.pop()!);
  }
  if (groupAIds.length === 0 || groupBIds.length === 0) return undefined;

  const toMembers = (ids: string[]): SplitPlanMemberRef[] =>
    ids.map((id) => {
      const user = users.find((u) => u.id === id);
      const displayName = user?.displayName?.trim();
      return {
        id,
        displayName: displayName || `成员 ${id.slice(0, 6)}`,
        avatarUrl: user?.avatarUrl?.trim() || undefined,
      };
    });

  return {
    groupA: {
      memberIds: groupAIds,
      label: formatMemberGroupLabel(groupAIds, users, '体能较好'),
      members: toMembers(groupAIds),
    },
    groupB: {
      memberIds: groupBIds,
      label: formatMemberGroupLabel(groupBIds, users, '节奏保守'),
      members: toMembers(groupBIds),
    },
  };
}

function formatMemberGroupLabel(
  memberIds: string[],
  users: Array<{ id: string; displayName: string | null }>,
  personaHint: string,
): string {
  const names = memberIds
    .map((id) => users.find((u) => u.id === id)?.displayName?.trim())
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) {
    return `${personaHint}（${memberIds.length} 人）`;
  }
  const head = names.slice(0, 3).join('、');
  if (memberIds.length > 3) {
    return `${head} 等 ${memberIds.length} 人 · ${personaHint}`;
  }
  return `${head} · ${personaHint}`;
}
