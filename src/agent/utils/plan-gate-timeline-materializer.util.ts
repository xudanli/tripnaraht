import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { ItemType, type PrismaClient } from '@prisma/client';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import { bumpTripRevisionMetadata } from '../../trips/trip-constraint-solver/utils/trip-revision.util';
import type { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import { assertPlanMutationAllowedOrThrow } from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

export const PLAN_GATE_TIMELINE_NOTE_PREFIX = '[PlanGate]';

export interface PlanGateTimelineMaterializationJournal {
  planId: string;
  committedAt: string;
  itemIdsByDay: Record<string, string[]>;
}

export interface PlanGateTimelineWriteStats {
  added: number;
  modified: number;
  removed: number;
  materializedDays: number[];
  skippedDays: number[];
}

export interface PlanGateTimelineMaterializeInput {
  tripId: string;
  planState: PlanState;
  partialCommit?: boolean;
  commitDays?: number[];
}

interface PlannedItineraryRow {
  placeId?: number;
  type: ItemType;
  label: string;
  startMinutes: number;
  durationMinutes: number;
}

type PrismaLike = Pick<
  PrismaClient,
  '$transaction' | 'trip' | 'tripDay' | 'itineraryItem'
>;

function extractPlaceId(poi: unknown): number | undefined {
  if (!poi || typeof poi !== 'object') return undefined;
  const p = poi as Record<string, unknown>;
  const nested = p.poi as Record<string, unknown> | undefined;
  const candidates = [p.placeId, p.id, nested?.placeId, nested?.id];
  for (const candidate of candidates) {
    const parsed =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? parseInt(candidate, 10)
          : NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function poiLabel(poi: unknown): string | undefined {
  if (!poi || typeof poi !== 'object') return undefined;
  const p = poi as Record<string, unknown>;
  const nested = p.poi as Record<string, unknown> | undefined;
  return (
    (p.nameCN as string | undefined) ??
    (p.nameEN as string | undefined) ??
    (p.name as string | undefined) ??
    (nested?.nameCN as string | undefined) ??
    (nested?.nameEN as string | undefined)
  );
}

export function buildItineraryRowsFromSegment(segment: RouteSegment): PlannedItineraryRow[] {
  const metadata = segment.metadata ?? {};
  const rows: PlannedItineraryRow[] = [];
  let cursor = 9 * 60;

  const pushRow = (row: Omit<PlannedItineraryRow, 'startMinutes'> & { startMinutes?: number }) => {
    const startMinutes = row.startMinutes ?? cursor;
    rows.push({
      placeId: row.placeId,
      type: row.type,
      label: row.label,
      startMinutes,
      durationMinutes: row.durationMinutes,
    });
    cursor = startMinutes + row.durationMinutes + 15;
  };

  const attractions = metadata.attractions;
  if (Array.isArray(attractions)) {
    for (const entry of attractions) {
      const label = poiLabel(entry);
      if (!label) continue;
      pushRow({
        placeId: extractPlaceId(entry),
        type: ItemType.ACTIVITY,
        label,
        durationMinutes: 90,
      });
    }
  }

  const restaurants = metadata.restaurants;
  if (Array.isArray(restaurants)) {
    for (const entry of restaurants) {
      const nested = (entry as { poi?: unknown }).poi ?? entry;
      const label = poiLabel(nested) ?? poiLabel(entry);
      if (!label) continue;
      pushRow({
        placeId: extractPlaceId(nested) ?? extractPlaceId(entry),
        type: ItemType.MEAL_ANCHOR,
        label,
        durationMinutes: 75,
      });
    }
  }

  const accommodation = metadata.accommodation;
  if (accommodation) {
    const label = poiLabel(accommodation);
    if (label) {
      pushRow({
        placeId: extractPlaceId(accommodation),
        type: ItemType.REST,
        label,
        durationMinutes: 60,
        startMinutes: 21 * 60,
      });
    }
  }

  if (rows.length === 0) {
    const theme = (metadata.theme as string | undefined) ?? (metadata.name as string | undefined);
    const day = metadata.day as number | undefined;
    pushRow({
      type: ItemType.ACTIVITY,
      label: theme ?? (day != null ? `第 ${day} 天行程` : segment.segmentId),
      durationMinutes: 120,
    });
  }

  return rows;
}

function resolveSegmentDay(segment: RouteSegment, fallbackIndex: number): number {
  const day = segment.metadata?.day as number | undefined;
  return day != null && day > 0 ? day : fallbackIndex + 1;
}

function shouldMaterializeDay(
  day: number,
  input: PlanGateTimelineMaterializeInput,
): boolean {
  if (!input.partialCommit || !input.commitDays?.length) return true;
  return input.commitDays.includes(day);
}

function resolveDayDate(dayDate: Date, startMinutes: number): Date {
  const base = DateTime.fromJSDate(dayDate, { zone: 'utc' }).startOf('day');
  return base.plus({ minutes: startMinutes }).toJSDate();
}

export async function materializePlanStateToTimeline(
  prisma: PrismaLike,
  input: PlanGateTimelineMaterializeInput,
  effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
): Promise<PlanGateTimelineWriteStats> {
  assertPlanMutationAllowedOrThrow(
    effectivePlanWriteGuard,
    'materializePlanStateToTimeline',
  );

  const stats: PlanGateTimelineWriteStats = {
    added: 0,
    modified: 0,
    removed: 0,
    materializedDays: [],
    skippedDays: [],
  };

  const segments = input.planState.itinerary?.segments ?? [];
  if (!segments.length) return stats;

  const trip = await prisma.trip.findUnique({
    where: { id: input.tripId },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      metadata: true,
      TripDay: {
        orderBy: { date: 'asc' },
        include: { ItineraryItem: { select: { id: true } } },
      },
    },
  });

  if (!trip) {
    throw new Error(`找不到行程: ${input.tripId}`);
  }

  let tripDays = trip.TripDay;
  const requiredDays =
    input.planState.constraints?.time?.days ??
    Math.max(...segments.map((s, i) => resolveSegmentDay(s, i)));

  if (tripDays.length < requiredDays && trip.startDate) {
    const start = DateTime.fromJSDate(trip.startDate, { zone: 'utc' });
    for (let i = tripDays.length; i < requiredDays; i++) {
      const created = await prisma.tripDay.create({
        data: {
          id: randomUUID(),
          tripId: input.tripId,
          date: start.plus({ days: i }).toJSDate(),
        },
      });
      tripDays = [...tripDays, { ...created, ItineraryItem: [] }];
    }
  }

  const metadata = { ...((trip.metadata ?? {}) as Record<string, unknown>) };
  const previousJournal = metadata.planGateTimelineMaterialization as
    | PlanGateTimelineMaterializationJournal
    | undefined;

  const staleItemIds = new Set<string>();
  if (previousJournal?.itemIdsByDay) {
    for (const ids of Object.values(previousJournal.itemIdsByDay)) {
      for (const id of ids) staleItemIds.add(id);
    }
  }

  const nextJournal: PlanGateTimelineMaterializationJournal = {
    planId: input.planState.plan_id,
    committedAt: new Date().toISOString(),
    itemIdsByDay: {},
  };

  await prisma.$transaction(async (tx) => {
    if (staleItemIds.size > 0) {
      const deleted = await tx.itineraryItem.deleteMany({
        where: { id: { in: [...staleItemIds] } },
      });
      stats.removed += deleted.count;
    }

    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      const day = resolveSegmentDay(segment, index);
      if (!shouldMaterializeDay(day, input)) {
        stats.skippedDays.push(day);
        continue;
      }

      const tripDay = tripDays[day - 1];
      if (!tripDay) {
        stats.skippedDays.push(day);
        continue;
      }

      const rows = buildItineraryRowsFromSegment(segment);
      const createdIds: string[] = [];

      for (let order = 0; order < rows.length; order++) {
        const row = rows[order];
        const startTime = resolveDayDate(tripDay.date, row.startMinutes);
        const endTime = resolveDayDate(
          tripDay.date,
          row.startMinutes + row.durationMinutes,
        );
        const created = await tx.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: tripDay.id,
            placeId: row.placeId ?? null,
            type: row.type,
            startTime,
            endTime,
            order: order + 1,
            note: `${PLAN_GATE_TIMELINE_NOTE_PREFIX} ${row.label}`,
          },
        });
        createdIds.push(created.id);
        stats.added += 1;
      }

      if (createdIds.length) {
        nextJournal.itemIdsByDay[String(day)] = createdIds;
        stats.materializedDays.push(day);
      }
    }

    const nextMeta = bumpTripRevisionMetadata({
      ...metadata,
      planGateTimelineMaterialization: nextJournal,
      lastCommittedPlanId: input.planState.plan_id,
      lastCommittedAt: nextJournal.committedAt,
      currentPlanId: input.planState.plan_id,
    });

    await tx.trip.update({
      where: { id: input.tripId },
      data: {
        metadata: nextMeta as object,
        updatedAt: new Date(),
      },
    });
  });

  return stats;
}

export function summarizeTimelineWrite(stats: PlanGateTimelineWriteStats): string[] {
  const lines: string[] = [];
  if (stats.materializedDays.length) {
    lines.push(`已写入第 ${stats.materializedDays.join('、')} 天时间轴`);
  }
  if (stats.added > 0) {
    lines.push(`新增 ${stats.added} 个行程项`);
  }
  if (stats.removed > 0) {
    lines.push(`替换 ${stats.removed} 个旧行程项`);
  }
  if (stats.skippedDays.length) {
    lines.push(`跳过第 ${stats.skippedDays.join('、')} 天（无对应 TripDay 或未纳入提交范围）`);
  }
  return lines;
}
