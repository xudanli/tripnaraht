/**
 * WP3 — apply RFC-001 PlanOperations to real ItineraryItem rows (+ journal for rollback).
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { PlanOperation } from '../contracts/plan-operation.types';
import type { TripMutationSet } from '../../decision-semantics/types/decision-semantics.types';
import {
  bumpTripRevisionMetadata,
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import { buildTripMutationSetFromPlanOperations } from '../adapters/plan-operation-to-mutation.adapter';
import {
  assertExecutionLock,
  clearExecutionLock,
  Rfc001TripRevisionStaleError,
} from './rfc001-execution-lock.util';
import { isRfc001ItineraryMaterializeEnabled } from '../config/rfc001-iceland.config';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { planShiftOperationToMaterialization } from '../../execution-risk-center/materialization/shift-time-materialization.service';

const JOURNAL_KEY = 'rfc001MaterializationJournal';

export interface Rfc001MaterializationJournalEntry {
  operationId: string;
  kind: PlanOperation['kind'];
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  appliedAt: string;
}

export interface Rfc001MaterializationResult {
  applied: boolean;
  skipped: boolean;
  mutationSet?: TripMutationSet;
  removedItemIds: string[];
  createdItemIds: string[];
  updatedItemIds: string[];
  journalEntries: Rfc001MaterializationJournalEntry[];
}

@Injectable()
export class Rfc001ItineraryMaterializerService {
  private readonly logger = new Logger(Rfc001ItineraryMaterializerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly effectivePlanWriteGuard?: EffectivePlanWriteGuardService,
  ) {}

  async applyPlanOperations(input: {
    tripId: string;
    decisionId: string;
    operations: PlanOperation[];
  }): Promise<Rfc001MaterializationResult> {
    if (!isRfc001ItineraryMaterializeEnabled()) {
      return {
        applied: false,
        skipped: true,
        removedItemIds: [],
        createdItemIds: [],
        updatedItemIds: [],
        journalEntries: [],
      };
    }

    if (input.operations.length === 0) {
      return {
        applied: true,
        skipped: false,
        removedItemIds: [],
        createdItemIds: [],
        updatedItemIds: [],
        journalEntries: [],
        mutationSet: buildTripMutationSetFromPlanOperations({
          tripId: input.tripId,
          decisionId: input.decisionId,
          versionBefore: '0',
          operations: [],
        }),
      };
    }

    this.effectivePlanWriteGuard?.assertAuthorizedPlanMutation('rfc001.applyPlanOperations');

    try {
      await assertExecutionLock(this.prisma, input.tripId, input.decisionId);
    } catch (err) {
      if (err instanceof Rfc001TripRevisionStaleError) throw err;
      throw err;
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${input.tripId} not found`);
    }

    const rev = resolveTripRevision(trip);
    const mutationSet = buildTripMutationSetFromPlanOperations({
      tripId: input.tripId,
      decisionId: input.decisionId,
      versionBefore: revisionToString(rev),
      operations: input.operations,
    });

    const journalEntries: Rfc001MaterializationJournalEntry[] = [];
    const removedItemIds: string[] = [];
    const createdItemIds: string[] = [];
    const updatedItemIds: string[] = [];

    let meta = { ...((trip.metadata ?? {}) as Record<string, unknown>) };

    const tripDays = input.operations.some((op) => op.kind === 'ADD_ITEM')
      ? await this.prisma.tripDay.findMany({
          where: { tripId: input.tripId },
          orderBy: { date: 'asc' },
        })
      : [];

    for (const op of input.operations) {
      const itemId = op.parameters.itineraryItemId as string | undefined;

      if (op.kind === 'ADD_ITEM') {
        if (!itemId) continue;
        const existing = await this.prisma.itineraryItem.findUnique({
          where: { id: itemId },
        });
        if (existing) {
          createdItemIds.push(itemId);
          continue;
        }

        const tripDayIndex = op.parameters.tripDayIndex as number;
        const tripDay = tripDays[tripDayIndex];
        if (!tripDay) {
          throw new BadRequestException(
            `Trip day index ${tripDayIndex} not found for trip ${input.tripId}`,
          );
        }

        const dayDate = DateTime.fromJSDate(tripDay.date, { zone: 'utc' });
        const startTime = this.resolveItemDateTime(dayDate, String(op.parameters.startTime ?? '09:00'));
        const endTime = this.resolveItemDateTime(dayDate, String(op.parameters.endTime ?? '11:00'));
        const sourceTag = op.parameters.sourceTag as string | undefined;
        const title = String(op.parameters.title ?? '');
        const note = sourceTag === 'adjusted' ? `[攻略调整] ${title}` : title;

        const created = await this.prisma.itineraryItem.create({
          data: {
            id: itemId,
            tripDayId: tripDay.id,
            placeId: (op.parameters.placeId as number | null) ?? null,
            type: this.mapActivityTypeToItemType(String(op.parameters.activityType ?? 'sightseeing')),
            startTime,
            endTime,
            note,
          },
        });
        createdItemIds.push(created.id);
        journalEntries.push({
          operationId: op.operationId,
          kind: 'ADD_ITEM',
          entityId: created.id,
          after: created as unknown as Record<string, unknown>,
          appliedAt: new Date().toISOString(),
        });
        continue;
      }

      if (op.kind === 'REMOVE_ITEM' || op.kind === 'REPLACE_ITEM') {
        if (!itemId) continue;
        const existing = await this.prisma.itineraryItem.findUnique({
          where: { id: itemId },
        });
        if (!existing) {
          throw new BadRequestException(`ItineraryItem ${itemId} not found`);
        }

        journalEntries.push({
          operationId: op.operationId,
          kind: op.kind,
          entityId: itemId,
          before: existing as unknown as Record<string, unknown>,
          appliedAt: new Date().toISOString(),
        });

        await this.prisma.itineraryItem.delete({ where: { id: itemId } });
        removedItemIds.push(itemId);

        if (op.kind === 'REPLACE_ITEM') {
          const substitutePoiId = String(op.parameters.substitutePoiId ?? 'substitute');
          const newId = `${itemId}_rfc001_${input.decisionId.slice(-8)}`;
          const created = await this.prisma.itineraryItem.create({
            data: {
              id: newId,
              tripDayId: existing.tripDayId,
              type: existing.type,
              order: existing.order,
              startTime: existing.startTime,
              endTime: existing.endTime,
              note: `[RFC001 substitute ${substitutePoiId}] ${existing.note ?? ''}`.trim(),
            },
          });
          createdItemIds.push(created.id);
          journalEntries.push({
            operationId: `${op.operationId}_create`,
            kind: 'REPLACE_ITEM',
            entityId: created.id,
            after: created as unknown as Record<string, unknown>,
            appliedAt: new Date().toISOString(),
          });
        }
        continue;
      }

      if (op.kind === 'SHIFT_TIME') {
        const targetItemId =
          itemId ??
          (op.targetRefs.find((r) => r.kind === 'PLAN_ITEM')?.id as string | undefined);
        if (!targetItemId) continue;

        const target = await this.prisma.itineraryItem.findUnique({
          where: { id: targetItemId },
        });
        if (!target) {
          throw new BadRequestException(`ItineraryItem ${targetItemId} not found`);
        }

        const tripDay = await this.prisma.tripDay.findUnique({
          where: { id: target.tripDayId },
        });
        if (!tripDay) {
          throw new BadRequestException(`TripDay ${target.tripDayId} not found`);
        }

        const dayItems = await this.prisma.itineraryItem.findMany({
          where: { tripDayId: target.tripDayId },
          orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
        });

        const materialization = planShiftOperationToMaterialization({
          operation: op,
          dayItems,
          tripDays: [tripDay],
        });

        if (materialization.blocked) {
          throw new BadRequestException({
            code: materialization.blockReason ?? 'SHIFT_BLOCKED',
            message: materialization.conflicts[0]?.message ?? 'SHIFT_TIME materialization blocked',
            conflicts: materialization.conflicts,
          });
        }

        for (const update of materialization.updates) {
          const existing = dayItems.find((row) => row.id === update.itemId);
          if (!existing) continue;

          const data: {
            startTime?: Date;
            endTime?: Date;
            travelFromPreviousDuration?: number;
            bookedAt?: Date;
            bookingStatus?: string;
            bookingConfirmation?: string;
            note?: string;
          } = {};
          if (update.startTimeMs !== null) data.startTime = new Date(update.startTimeMs);
          if (update.endTimeMs !== null) data.endTime = new Date(update.endTimeMs);
          if (update.travelFromPreviousDurationMinutes !== undefined) {
            data.travelFromPreviousDuration = update.travelFromPreviousDurationMinutes;
          }
          if (update.bookedAtMs !== undefined && update.bookedAtMs !== null) {
            data.bookedAt = new Date(update.bookedAtMs);
          }
          if (update.bookingStatus !== undefined) data.bookingStatus = update.bookingStatus;
          if (update.bookingConfirmation !== undefined) {
            data.bookingConfirmation = update.bookingConfirmation;
          }
          if (update.note !== undefined) data.note = update.note;

          await this.prisma.itineraryItem.update({
            where: { id: update.itemId },
            data,
          });
          updatedItemIds.push(update.itemId);
          journalEntries.push({
            operationId: `${op.operationId}_${update.itemId}`,
            kind: 'SHIFT_TIME',
            entityId: update.itemId,
            before: existing as unknown as Record<string, unknown>,
            after: {
              ...existing,
              startTime: data.startTime ?? existing.startTime,
              endTime: data.endTime ?? existing.endTime,
              travelFromPreviousDuration:
                data.travelFromPreviousDuration ?? existing.travelFromPreviousDuration,
              bookedAt: data.bookedAt ?? existing.bookedAt,
              bookingStatus: data.bookingStatus ?? existing.bookingStatus,
              bookingConfirmation: data.bookingConfirmation ?? existing.bookingConfirmation,
              note: data.note ?? existing.note,
            },
            appliedAt: new Date().toISOString(),
          });
        }
        continue;
      }

      if (op.kind === 'CHANGE_ROUTE') {
        const bypassRoadId = String(op.parameters.bypassRoadId ?? '');
        const targetItemId =
          itemId ??
          (op.targetRefs.find((r) => r.kind === 'PLAN_ITEM')?.id as string | undefined);

        const bindingsBlock = (meta.rfc001IcelandRoadBindings ?? {
          byItemId: {},
        }) as { byItemId?: Record<string, string[]> };

        const beforeBindings = JSON.parse(JSON.stringify(bindingsBlock));
        if (targetItemId && bypassRoadId) {
          const byItemId = { ...(bindingsBlock.byItemId ?? {}) };
          byItemId[targetItemId] = [bypassRoadId.toUpperCase()];
          meta = {
            ...meta,
            rfc001IcelandRoadBindings: { ...bindingsBlock, byItemId },
          };
          updatedItemIds.push(targetItemId);
        }

        journalEntries.push({
          operationId: op.operationId,
          kind: op.kind,
          entityId: targetItemId,
          before: { rfc001IcelandRoadBindings: beforeBindings },
          after: { rfc001IcelandRoadBindings: meta.rfc001IcelandRoadBindings },
          appliedAt: new Date().toISOString(),
        });
      }
    }

    const journal = (meta[JOURNAL_KEY] ?? {}) as Record<
      string,
      Rfc001MaterializationJournalEntry[]
    >;
    journal[input.decisionId] = journalEntries;
    meta[JOURNAL_KEY] = journal;
    meta.rfc001LastMaterializedDecision = input.decisionId;
    meta.rfc001LastMutationSetId = mutationSet.mutationId;

    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: { metadata: toInputJsonValue(meta) },
    });

    await clearExecutionLock(this.prisma, input.tripId, input.decisionId);

    mutationSet.versionAfter = revisionToString(
      resolveTripRevision({ metadata: meta, updatedAt: new Date() }),
    );

    this.logger.debug(
      `materialize trip=${input.tripId} decision=${input.decisionId} removed=${removedItemIds.length} created=${createdItemIds.length}`,
    );

    return {
      applied: true,
      skipped: false,
      mutationSet,
      removedItemIds,
      createdItemIds,
      updatedItemIds,
      journalEntries,
    };
  }

  async rollbackMaterialization(input: {
    tripId: string;
    decisionId: string;
  }): Promise<{ restoredItemIds: string[]; removedSubstituteIds: string[] }> {
    if (!isRfc001ItineraryMaterializeEnabled()) {
      return { restoredItemIds: [], removedSubstituteIds: [] };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip ${input.tripId} not found`);
    }

    const meta = { ...((trip.metadata ?? {}) as Record<string, unknown>) };
    const journal = (meta[JOURNAL_KEY] ?? {}) as Record<
      string,
      Rfc001MaterializationJournalEntry[]
    >;
    const entries = journal[input.decisionId] ?? [];
    const restoredItemIds: string[] = [];
    const removedSubstituteIds: string[] = [];

    for (const entry of [...entries].reverse()) {
      if (entry.kind === 'ADD_ITEM' && entry.after && !entry.before) {
        const addedId = entry.entityId;
        if (addedId) {
          await this.prisma.itineraryItem.delete({ where: { id: addedId } }).catch(() => undefined);
          removedSubstituteIds.push(addedId);
        }
        continue;
      }

      if (entry.kind === 'REPLACE_ITEM' && entry.after && !entry.before) {
        const substituteId = entry.entityId;
        if (substituteId) {
          await this.prisma.itineraryItem.delete({ where: { id: substituteId } }).catch(() => undefined);
          removedSubstituteIds.push(substituteId);
        }
        continue;
      }

      if (
        (entry.kind === 'REMOVE_ITEM' || entry.kind === 'REPLACE_ITEM') &&
        entry.before
      ) {
        const row = entry.before as {
          id: string;
          tripDayId: string;
          type: string;
          order?: number | null;
          startTime?: Date | string | null;
          endTime?: Date | string | null;
          note?: string | null;
          placeId?: number | null;
          travelFromPreviousDistance?: number | null;
          travelFromPreviousDuration?: number | null;
        };
        await this.prisma.itineraryItem
          .create({
            data: {
              id: row.id,
              tripDayId: row.tripDayId,
              type: row.type as any,
              order: row.order ?? undefined,
              startTime: row.startTime ? new Date(row.startTime) : undefined,
              endTime: row.endTime ? new Date(row.endTime) : undefined,
              note: row.note ?? undefined,
              placeId: row.placeId ?? undefined,
              travelFromPreviousDistance: row.travelFromPreviousDistance ?? undefined,
              travelFromPreviousDuration: row.travelFromPreviousDuration ?? undefined,
            },
          })
          .catch(() => undefined);
        restoredItemIds.push(row.id);
        continue;
      }

      if (entry.kind === 'CHANGE_ROUTE' && entry.before?.rfc001IcelandRoadBindings) {
        meta.rfc001IcelandRoadBindings = entry.before.rfc001IcelandRoadBindings;
      }

      if (entry.kind === 'SHIFT_TIME' && entry.before) {
        const row = entry.before as {
          id: string;
          startTime?: Date | string | null;
          endTime?: Date | string | null;
        };
        await this.prisma.itineraryItem
          .update({
            where: { id: row.id },
            data: {
              startTime: row.startTime ? new Date(row.startTime) : null,
              endTime: row.endTime ? new Date(row.endTime) : null,
            },
          })
          .catch(() => undefined);
        restoredItemIds.push(row.id);
      }
    }

    delete journal[input.decisionId];
    const nextMeta = bumpTripRevisionMetadata({
      ...meta,
      [JOURNAL_KEY]: journal,
    });

    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: { metadata: toInputJsonValue(nextMeta) },
    });

    return { restoredItemIds, removedSubstituteIds };
  }

  private resolveItemDateTime(dayDate: DateTime, time: string): Date {
    const timePart = time.includes('T') ? time.split('T')[1] : time;
    const [h, m] = timePart.split(':').map(Number);
    return dayDate.set({ hour: h || 9, minute: m || 0, second: 0, millisecond: 0 }).toJSDate();
  }

  private mapActivityTypeToItemType(type: string): ItemType {
    switch (type) {
      case 'food':
        return ItemType.MEAL_ANCHOR;
      case 'hotel':
        return ItemType.REST;
      default:
        return ItemType.ACTIVITY;
    }
  }
}
