import { DateTime } from 'luxon';
import { TripStatus, normalizeTripStatus } from '../dto/trip-status.dto';
import type {
  TripListApiStatus,
  TripListCardDto,
  TripListDisplayStatus,
  TripListPrimaryAction,
  TripListSummaryDto,
  TripPlanningAvailability,
  TripListContentMode,
} from '../dto/frontend-trip-list-api.types';
import {
  isExecutableScheduleReady,
  isRouteEstablishedForTrip,
  isTripGeneratingItems,
  resolveEffectiveGenerationProgress,
  resolveTripContentMode,
  type TripContentMode,
} from './trip-content-mode.util';

const DISPLAY_STATUS_LABELS: Record<TripListDisplayStatus, string> = {
  planning: '规划中',
  pre_trip: '行前准备',
  traveling: '旅行中',
  completed: '已完成',
  cancelled: '已取消',
};

const PRE_TRIP_WINDOW_DAYS = 14;

export function toApiTripStatus(status: string | null | undefined): TripListApiStatus {
  const normalized = normalizeTripStatus(status ?? null);
  if (normalized === TripStatus.CANCELLED) return 'CANCELLED';
  if (normalized === TripStatus.COMPLETED) return 'COMPLETED';
  if (normalized === TripStatus.TRAVELING) return 'IN_PROGRESS';
  return 'PLANNING';
}

export function resolveTripListDisplayStatus(input: {
  status: string | null | undefined;
  startDate: Date;
  now?: DateTime;
}): TripListDisplayStatus {
  const normalized = normalizeTripStatus(input.status ?? null);
  if (normalized === TripStatus.CANCELLED) return 'cancelled';
  if (normalized === TripStatus.COMPLETED) return 'completed';
  if (normalized === TripStatus.TRAVELING) return 'traveling';

  const now = input.now ?? DateTime.now();
  const start = DateTime.fromJSDate(input.startDate);
  const daysUntilStart = start.startOf('day').diff(now.startOf('day'), 'days').days;
  if (normalized === TripStatus.PLANNING && daysUntilStart >= 0 && daysUntilStart <= PRE_TRIP_WINDOW_DAYS) {
    return 'pre_trip';
  }

  return 'planning';
}

export function resolveDisplayStatusLabel(displayStatus: TripListDisplayStatus): string {
  return DISPLAY_STATUS_LABELS[displayStatus];
}

export function resolvePlanningAvailability(input: {
  destination: string;
  startDate: Date;
  endDate: Date;
  metadata: unknown;
  totalItems: number;
  daysWithItems?: number;
  totalDays?: number;
}): TripPlanningAvailability {
  const metadata = input.metadata;
  const generationProgress = resolveEffectiveGenerationProgress(metadata, input.totalItems);
  if (generationProgress?.status === 'failed') return 'failed';
  if (isTripGeneratingItems(metadata, input.totalItems) || generationProgress?.status === 'generating') {
    return 'generating';
  }

  if (!input.destination || !input.startDate || !input.endDate) {
    return 'collecting_info';
  }

  if (
    isRouteEstablishedForTrip(metadata, input.totalItems) ||
    isExecutableScheduleReady(metadata, input.totalItems, input.daysWithItems ?? 0, input.totalDays ?? 0) ||
    input.totalItems > 0
  ) {
    return 'ready';
  }

  return 'ready_to_generate';
}

export function toApiTripContentMode(mode: TripContentMode): TripListContentMode {
  if (mode === 'hiking_primary') return 'hiking_primary';
  if (mode === 'skeleton_only') return 'skeleton_only';
  return 'poi_timeline';
}

export function resolvePrimaryAction(displayStatus: TripListDisplayStatus): TripListPrimaryAction | undefined {
  switch (displayStatus) {
    case 'planning':
      return { label: '继续规划', intent: 'open_plan_studio' };
    case 'pre_trip':
      return { label: '去确认', intent: 'open_detail' };
    case 'traveling':
      return { label: '进入今日行程', intent: 'open_execute' };
    case 'completed':
      return { label: '查看复盘', intent: 'open_insights' };
    default:
      return undefined;
  }
}

export function readMetadataNumber(metadata: unknown, keys: string[]): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const meta = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export function computeLitePlanningProgressPercent(input: {
  metadata: unknown;
  destination: string;
  startDate: Date;
  endDate: Date;
  totalItems: number;
  daysWithItems: number;
  totalDays: number;
}): number | null {
  const fromMeta = readMetadataNumber(input.metadata, ['progressPercent', 'planningProgress']);
  if (fromMeta != null) {
    return Math.round(Math.min(100, Math.max(0, fromMeta)));
  }

  const checkpoints = [
    Boolean(input.destination && input.startDate && input.endDate),
    isRouteEstablishedForTrip(input.metadata, input.totalItems),
    isExecutableScheduleReady(
      input.metadata,
      input.totalItems,
      input.daysWithItems,
      input.totalDays,
    ),
  ].filter(Boolean).length;

  if (checkpoints === 0) return null;
  return Math.round((checkpoints / 5) * 100);
}

export function resolveTravelingSnapshot(metadata: unknown): TripListSummaryDto['traveling'] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const meta = metadata as Record<string, unknown>;
  const nextStop =
    meta.nextStop && typeof meta.nextStop === 'object' && !Array.isArray(meta.nextStop)
      ? (meta.nextStop as Record<string, unknown>)
      : null;

  const nextStopName =
    (typeof nextStop?.placeName === 'string' && nextStop.placeName) ||
    (typeof meta.nextStopName === 'string' && meta.nextStopName) ||
    null;
  const nextStopEta =
    (typeof nextStop?.startTime === 'string' && nextStop.startTime) ||
    (typeof nextStop?.estimatedArrivalTime === 'string' && nextStop.estimatedArrivalTime) ||
    null;

  if (!nextStopName && !nextStopEta) return undefined;
  return { nextStopName, nextStopEta };
}

export function sortTripsForListPage<T extends { status: string | null; createdAt: Date }>(
  trips: T[],
): T[] {
  return [...trips].sort((a, b) => {
    const aCancelled = normalizeTripStatus(a.status) === TripStatus.CANCELLED;
    const bCancelled = normalizeTripStatus(b.status) === TripStatus.CANCELLED;
    if (aCancelled !== bCancelled) return aCancelled ? 1 : -1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function expandStatusFilter(statuses: string[]): string[] {
  const expanded = new Set<string>();
  for (const raw of statuses) {
    const status = raw.trim().toUpperCase();
    if (!status) continue;
    expanded.add(status);
    if (status === 'IN_PROGRESS') expanded.add('TRAVELING');
    if (status === 'TRAVELING') expanded.add('IN_PROGRESS');
  }
  return [...expanded];
}

export type BuildTripListSummaryInput = {
  destination: string;
  status: string | null;
  startDate: Date;
  endDate: Date;
  metadata: unknown;
  coverImageUrl?: string | null;
  totalItems: number;
  daysWithItems: number;
  totalDays: number;
  memberCount: number;
  memberAvatars: TripListSummaryDto['memberAvatars'];
  totalBudget: number;
  currency?: string;
};

export function buildTripListSummary(input: BuildTripListSummaryInput): TripListSummaryDto {
  const displayStatus = resolveTripListDisplayStatus({
    status: input.status,
    startDate: input.startDate,
  });
  const durationDays = Math.max(
    1,
    Math.ceil(
      DateTime.fromJSDate(input.endDate)
        .startOf('day')
        .diff(DateTime.fromJSDate(input.startDate).startOf('day'), 'days').days,
    ) + 1,
  );

  const budgetPerPerson =
    input.totalBudget > 0 && input.memberCount > 0
      ? Math.round(input.totalBudget / input.memberCount)
      : null;

  const summary: TripListSummaryDto = {
    displayStatus,
    displayStatusLabel: resolveDisplayStatusLabel(displayStatus),
    coverImageUrl: input.coverImageUrl ?? null,
    durationDays,
    memberCount: input.memberCount,
    memberAvatars: input.memberAvatars,
    progressPercent: computeLitePlanningProgressPercent({
      metadata: input.metadata,
      destination: input.destination,
      startDate: input.startDate,
      endDate: input.endDate,
      totalItems: input.totalItems,
      daysWithItems: input.daysWithItems,
      totalDays: input.totalDays,
    }),
    budgetPerPerson,
    primaryAction: resolvePrimaryAction(displayStatus),
  };

  if (displayStatus === 'traveling') {
    summary.traveling = resolveTravelingSnapshot(input.metadata);
  }

  return summary;
}

export function mapTripRowToListCard(input: {
  trip: {
    id: string;
    name: string | null;
    destination: string;
    startDate: Date;
    endDate: Date;
    status: string | null;
    budgetConfig: unknown;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
    TripDay: Array<{ id: string; date: Date; _count: { ItineraryItem: number } }>;
  };
  destinationLabel?: string;
  currency?: string;
  totalBudget: number;
  memberCount: number;
  memberAvatars: TripListSummaryDto['memberAvatars'];
  listSummary: TripListSummaryDto | null;
}): TripListCardDto {
  const { trip } = input;
  const totalItems = trip.TripDay.reduce((sum, day) => sum + day._count.ItineraryItem, 0);
  const tripContentMode = toApiTripContentMode(resolveTripContentMode(trip.metadata, totalItems));
  const generatingItems = isTripGeneratingItems(trip.metadata, totalItems);
  const daysWithItems = trip.TripDay.filter((day) => day._count.ItineraryItem > 0).length;

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : undefined;

  return {
    id: trip.id,
    name: trip.name ?? undefined,
    destination: trip.destination,
    destinationLabel: input.destinationLabel,
    startDate: trip.startDate.toISOString(),
    endDate: trip.endDate.toISOString(),
    status: toApiTripStatus(trip.status),
    totalBudget: input.totalBudget,
    currency: input.currency,
    days: trip.TripDay.map((day) => ({
      id: day.id,
      date: DateTime.fromJSDate(day.date).toISODate() ?? day.date.toISOString().slice(0, 10),
    })),
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
    planningAvailability: resolvePlanningAvailability({
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      metadata: trip.metadata,
      totalItems,
      daysWithItems,
      totalDays: trip.TripDay.length,
    }),
    generatingItems,
    tripContentMode,
    metadata,
    listSummary: input.listSummary,
  };
}
