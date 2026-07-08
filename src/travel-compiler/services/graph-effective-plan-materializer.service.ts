import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import type { Itinerary, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';
import type { CanonicalTravelGraph } from '../contracts/canonical-travel-graph.types';
import {
  bumpTripRevisionMetadata,
} from '../../trips/trip-constraint-solver/utils/trip-revision.util';
import { EffectivePlanWriteGuardService } from '../../decision-runtime/execution/effective-plan-write-guard.service';
import { assertPlanMutationAllowedOrThrow } from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { TRIP_METADATA_GRAPH_EFFECTIVE_PLAN_JOURNAL } from '../constants/travel-graph-metadata.constants';

export interface GraphEffectivePlanMaterializationJournal {
  compileId: string;
  graphId: string;
  committedAt: string;
  itemIdsByDay: Record<string, string[]>;
}

export interface GraphEffectivePlanMaterializeResult {
  applied: boolean;
  skipped: boolean;
  reason?: string;
  itemCount: number;
  removedItemCount: number;
  journal?: GraphEffectivePlanMaterializationJournal;
}

@Injectable()
export class GraphEffectivePlanMaterializerService {
  private readonly logger = new Logger(GraphEffectivePlanMaterializerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  async materializeFromGraph(input: {
    tripId: string;
    graph: CanonicalTravelGraph;
    itinerary: Itinerary;
  }): Promise<GraphEffectivePlanMaterializeResult> {
    assertPlanMutationAllowedOrThrow(
      this.effectivePlanWriteGuard,
      'graphEffectivePlanMaterializer.materializeFromGraph',
    );

    const run = async (): Promise<GraphEffectivePlanMaterializeResult> => {
      const trip = await this.prisma.trip.findUnique({
        where: { id: input.tripId },
        select: {
          id: true,
          metadata: true,
          updatedAt: true,
          TripDay: {
            orderBy: { date: 'asc' },
            select: { id: true, date: true },
          },
        },
      });
      if (!trip) {
        throw new NotFoundException(`Trip ${input.tripId} not found`);
      }

      const metadata = { ...((trip.metadata ?? {}) as Record<string, unknown>) };
      const previousJournal = metadata[TRIP_METADATA_GRAPH_EFFECTIVE_PLAN_JOURNAL] as
        | GraphEffectivePlanMaterializationJournal
        | undefined;

      const staleItemIds = new Set<string>();
      if (previousJournal?.itemIdsByDay) {
        for (const ids of Object.values(previousJournal.itemIdsByDay)) {
          for (const id of ids) staleItemIds.add(id);
        }
      }

      const journal: GraphEffectivePlanMaterializationJournal = {
        compileId: input.graph.compileId,
        graphId: input.graph.graphId,
        committedAt: new Date().toISOString(),
        itemIdsByDay: {},
      };

      let itemCount = 0;
      let removedItemCount = 0;

      await this.prisma.$transaction(async (tx) => {
        if (staleItemIds.size > 0) {
          const deleted = await tx.itineraryItem.deleteMany({
            where: { id: { in: [...staleItemIds] } },
          });
          removedItemCount = deleted.count;
        }

        for (let dayIndex = 0; dayIndex < input.itinerary.days.length; dayIndex += 1) {
          const day = input.itinerary.days[dayIndex]!;
          const tripDay = trip.TripDay[dayIndex];
          if (!tripDay) continue;

          const dayKey = tripDay.id;
          const createdIds: string[] = [];

          for (const item of day.items ?? []) {
            const row = this.buildItineraryRow(item, tripDay.date, day.date);
            const id = randomUUID();
            await tx.itineraryItem.create({
              data: {
                id,
                tripDayId: tripDay.id,
                placeId: row.placeId,
                type: row.type,
                startTime: row.startTime,
                endTime: row.endTime,
                note: row.note,
              },
            });
            createdIds.push(id);
            itemCount += 1;
          }

          if (createdIds.length > 0) {
            journal.itemIdsByDay[dayKey] = createdIds;
          }
        }

        metadata[TRIP_METADATA_GRAPH_EFFECTIVE_PLAN_JOURNAL] = journal;
        metadata.effectivePlanSource = 'canonical_travel_graph@v0';
        metadata.effectivePlanCompileId = input.graph.compileId;
        const nextMetadata = bumpTripRevisionMetadata(metadata);

        await tx.trip.update({
          where: { id: input.tripId },
          data: {
            metadata: toInputJsonValue(nextMetadata),
            updatedAt: new Date(),
          },
        });
      });

      this.logger.log(
        `Graph effective plan materialized trip=${input.tripId} compileId=${input.graph.compileId} items=${itemCount} removed=${removedItemCount}`,
      );

      return {
        applied: true,
        skipped: false,
        itemCount,
        removedItemCount,
        journal,
      };
    };

    if (this.effectivePlanWriteGuard) {
      return this.effectivePlanWriteGuard.runWithAuthority('execute', run);
    }
    return run();
  }

  private buildItineraryRow(
    item: ItineraryItem,
    tripDayDate: Date,
    itineraryDayDate?: string,
  ): {
    placeId: number | null;
    type: ItemType;
    startTime: Date;
    endTime: Date;
    note: string;
  } {
    const baseDate = itineraryDayDate
      ? DateTime.fromISO(itineraryDayDate.slice(0, 10), { zone: 'utc' })
      : DateTime.fromJSDate(tripDayDate, { zone: 'utc' });

    const startParts = parseTimeWindow(item.start_window, 9, 0);
    const endParts = parseTimeWindow(item.end_window, startParts.hour + 2, startParts.minute);

    const canonicalPoiId =
      (item.metadata as Record<string, unknown> | undefined)?.canonical_poi_id ??
      item.location_ref?.place_id;

    const notePrefix = canonicalPoiId ? `[CTRE ${canonicalPoiId}] ` : '[CTRE] ';
    const label = item.location_ref?.name?.trim() || item.notes?.trim() || item.type;

    return {
      placeId: parsePlaceId(item.location_ref?.place_id),
      type: mapItineraryItemType(item.type),
      startTime: baseDate.set({ hour: startParts.hour, minute: startParts.minute }).toJSDate(),
      endTime: baseDate.set({ hour: endParts.hour, minute: endParts.minute }).toJSDate(),
      note: `${notePrefix}${label}`.trim(),
    };
  }
}

function parseTimeWindow(
  window: string | undefined,
  defaultHour: number,
  defaultMinute: number,
): { hour: number; minute: number } {
  if (!window?.trim()) return { hour: defaultHour, minute: defaultMinute };
  const t = window.trim();
  const hhmm = t.length <= 5 ? t : t.slice(11, 16);
  const hour = Number.parseInt(hhmm.slice(0, 2), 10);
  const minute = Number.parseInt(hhmm.slice(3, 5), 10);
  if (Number.isNaN(hour)) return { hour: defaultHour, minute: defaultMinute };
  return { hour, minute: Number.isNaN(minute) ? defaultMinute : minute };
}

function parsePlaceId(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapItineraryItemType(type: ItineraryItem['type']): ItemType {
  switch (type) {
    case 'MEAL':
      return ItemType.MEAL_ANCHOR;
    case 'ACCOMMODATION':
      return ItemType.REST;
    case 'REST':
      return ItemType.REST;
    case 'DRIVE':
    case 'WALK':
    case 'TRANSIT':
      return ItemType.TRANSIT;
    default:
      return ItemType.ACTIVITY;
  }
}
