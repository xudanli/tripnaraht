/**
 * ITINERARY_ADJUST AUTHORITATIVE_CANARY executor with real DB transaction + RESOURCE_VERSION_SET OCC.
 * Trip row is locked FOR UPDATE so concurrent multi-instance Apply coalesces to ≤1 mutation.
 */

import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { resolveTripRevision } from '../../../trips/trip-constraint-solver/utils/trip-revision.util';
import { evaluateAtomicOccDecision } from './expected-write-version';
import {
  AUTHORITATIVE_WRITE_CONTRACT_VERSION,
  AUTHORITATIVE_WRITE_ERROR_CODES,
  type AuthoritativeWriteResult,
} from './authoritative-write.types';
import { UWC_ITINERARY_CANARY_MODE } from './itinerary-adjust-canary.config';
import type {
  ItineraryCanaryItemCreate,
  ItineraryCanaryItemReorder,
  ItineraryCanaryTimeUpdate,
} from './itinerary-adjust-canary.admit';

export type ItineraryAdjustCanaryPrisma = {
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => Promise<T>;
};

export type ExecuteItineraryAdjustCanaryInput = {
  prisma: ItineraryAdjustCanaryPrisma;
  tripId: string;
  idempotencyKey: string;
  expectedTripRevision: number;
  /** MOVE same-day time adjust */
  timeUpdates?: readonly ItineraryCanaryTimeUpdate[];
  /** ADD same-day create items */
  itemCreates?: readonly ItineraryCanaryItemCreate[];
  /** Explore-candidate ids to delete (AUTO_ARRANGE from-candidates) */
  candidateRemovals?: readonly string[];
  /** Same-day REMOVE item ids */
  itemRemovals?: readonly string[];
  /** Same-day REORDER — { itemId, order } (no time rewrite) */
  itemReorders?: readonly ItineraryCanaryItemReorder[];
  /** Optional op for audit family (e.g. same_day_reduce_intensity vs move_and_add). */
  operation?: string;
  /** Optional prior idempotency hit inside trip.metadata.uwcCanaryIdem */
  priorIdempotencyApplied?: boolean;
};

function result(
  partial: Omit<AuthoritativeWriteResult, 'schemaId' | 'contractVersion' | 'corridor'>,
): AuthoritativeWriteResult {
  return {
    schemaId: 'tripnara.authoritative_write_result@v1',
    contractVersion: AUTHORITATIVE_WRITE_CONTRACT_VERSION,
    corridor: 'ITINERARY_ADJUST',
    ...partial,
  };
}

/** Row lock for multi-instance; no-op on unit mocks without $queryRaw. */
async function lockTripForUpdate(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<void> {
  if (typeof (tx as { $queryRaw?: unknown }).$queryRaw !== 'function') return;
  await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${tripId} FOR UPDATE`;
}

export async function executeItineraryAdjustAuthoritativeCanary(
  input: ExecuteItineraryAdjustCanaryInput,
): Promise<AuthoritativeWriteResult> {
  const timeUpdates = input.timeUpdates ?? [];
  const itemCreates = input.itemCreates ?? [];
  const candidateRemovals = (input.candidateRemovals ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const itemRemovals = (input.itemRemovals ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const itemReorders = (input.itemReorders ?? []).filter(
    (r) => r && String(r.itemId ?? '').trim() && Number.isFinite(r.order),
  );

  const mutationKinds = [
    timeUpdates.length > 0,
    itemCreates.length > 0,
    itemRemovals.length > 0,
    itemReorders.length > 0,
  ].filter(Boolean).length;

  /** Atomic time+create composites (MOVE+ADD or REDUCE_INTENSITY). */
  const isAtomicTimeAndCreate =
    timeUpdates.length > 0 &&
    itemCreates.length > 0 &&
    itemRemovals.length === 0 &&
    itemReorders.length === 0 &&
    candidateRemovals.length === 0;
  const isReduceIntensity =
    String(input.operation ?? '').toLowerCase() === 'same_day_reduce_intensity';
  const isMultiDayFromCandidates =
    String(input.operation ?? '').toLowerCase() ===
      'multi_day_add_from_candidates' ||
    (candidateRemovals.length > 0 &&
      new Set(
        itemCreates.map((c) => String(c.tripDayId ?? '').trim()).filter(Boolean),
      ).size >= 2);

  if (mutationKinds === 0) {
    return result({
      outcome: 'REJECTED',
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
      reasonCodes: [
        'ITINERARY_REQUIRES_TIME_UPDATES_OR_ITEM_CREATES_OR_REMOVALS_OR_REORDERS',
        UWC_ITINERARY_CANARY_MODE,
      ],
      writeTargetsTouched: [],
      idempotencyKey: input.idempotencyKey,
    });
  }
  if (
    (!isAtomicTimeAndCreate && mutationKinds > 1) ||
    (candidateRemovals.length && !itemCreates.length)
  ) {
    return result({
      outcome: 'REJECTED',
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
      reasonCodes: ['MIXED_ITINERARY_MUTATION_FAMILIES', UWC_ITINERARY_CANARY_MODE],
      writeTargetsTouched: [],
      idempotencyKey: input.idempotencyKey,
    });
  }
  if (candidateRemovals.length && timeUpdates.length) {
    return result({
      outcome: 'REJECTED',
      errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
      reasonCodes: [
        'CANDIDATE_REMOVALS_REQUIRE_FROM_CANDIDATES_OP',
        UWC_ITINERARY_CANARY_MODE,
      ],
      writeTargetsTouched: [],
      idempotencyKey: input.idempotencyKey,
    });
  }

  if (input.priorIdempotencyApplied) {
    return result({
      outcome: 'IDEMPOTENT_REPLAY',
      reasonCodes: ['ALREADY_APPLIED', UWC_ITINERARY_CANARY_MODE],
      writeTargetsTouched: [],
      idempotencyKey: input.idempotencyKey,
      corridorResult: {
        canary: true,
        dualExecution: false,
        transaction: 'none_replay',
      },
    });
  }

  try {
    const applied = await input.prisma.$transaction(async (tx) => {
      // Multi-instance safety: serialize Confirm/Apply on this trip row.
      await lockTripForUpdate(tx, input.tripId);

      // M1-02 rehearsal / Staging fault injection — abort txn before any durable write.
      if (
        String(process.env.UWC_M1_CRASH_AFTER_LOCK ?? '').trim() === '1' &&
        String(process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY ?? '').trim() ===
          input.idempotencyKey
      ) {
        throw new Error('M1_CRASH_AFTER_LOCK');
      }

      const trip = await tx.trip.findUnique({
        where: { id: input.tripId },
        select: { id: true, metadata: true, updatedAt: true },
      });
      if (!trip) {
        return {
          kind: 'reject' as const,
          reasonCodes: ['TRIP_NOT_FOUND'],
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      const meta = {
        ...((trip.metadata ?? {}) as Record<string, unknown>),
      };
      const idemMap =
        meta.uwcItineraryCanaryIdem &&
        typeof meta.uwcItineraryCanaryIdem === 'object'
          ? ({ ...(meta.uwcItineraryCanaryIdem as Record<string, unknown>) } as Record<
              string,
              unknown
            >)
          : {};
      if (idemMap[input.idempotencyKey] === 'APPLIED') {
        return { kind: 'replay' as const };
      }

      const observedRev = resolveTripRevision(trip).revision;
      const occ = evaluateAtomicOccDecision({
        idempotencyKey: input.idempotencyKey,
        prior: null,
        expected: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            {
              resourceId: input.tripId,
              expectedVersion: input.expectedTripRevision,
            },
          ],
        },
        observed: {
          kind: 'RESOURCE_VERSION_SET',
          resources: [
            { resourceId: input.tripId, observedVersion: observedRev },
          ],
        },
      });

      if (occ.decision === 'VERSION_CONFLICT') {
        return {
          kind: 'conflict' as const,
          reasonCodes: occ.reasonCodes,
        };
      }
      if (occ.decision !== 'PROCEED') {
        return {
          kind: 'reject' as const,
          reasonCodes: occ.reasonCodes,
          errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        };
      }

      for (const u of timeUpdates) {
        const item = await tx.itineraryItem.findUnique({
          where: { id: u.itemId },
          select: {
            id: true,
            isPaid: true,
            bookedAt: true,
            bookingStatus: true,
            startTime: true,
            endTime: true,
          },
        });
        if (!item) {
          throw new Error(`ITEM_NOT_FOUND:${u.itemId}`);
        }
        if (item.isPaid || item.bookedAt) {
          throw new Error(`ITEM_BOOKED_OR_PAID:${u.itemId}`);
        }
        const bs = String(item.bookingStatus ?? '').toUpperCase();
        if (bs && !['NONE', 'UNBOOKED', 'DRAFT', ''].includes(bs)) {
          throw new Error(`ITEM_BOOKING_STATUS:${u.itemId}:${bs}`);
        }

        await tx.itineraryItem.update({
          where: { id: u.itemId },
          data: {
            startTime: new Date(u.startTimeIso),
            endTime: new Date(u.endTimeIso),
          },
        });
      }

      for (const c of itemCreates) {
        const start = new Date(c.startTimeIso);
        const end = new Date(c.endTimeIso);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
          throw new Error(`INVALID_ITEM_CREATE_WINDOW:${c.clientItemKey || c.tripDayId}`);
        }
        const maxOrder = await tx.itineraryItem.findFirst({
          where: { tripDayId: c.tripDayId },
          orderBy: { order: 'desc' },
          select: { order: true },
        });
        const nextOrder =
          maxOrder?.order !== null && maxOrder?.order !== undefined
            ? maxOrder.order + 1
            : 1;
        await tx.itineraryItem.create({
          data: {
            id: randomUUID(),
            tripDayId: c.tripDayId,
            placeId: c.placeId ?? null,
            type: (c.type as never) ?? 'ACTIVITY',
            startTime: start,
            endTime: end,
            note: c.note ?? null,
            order: nextOrder,
          } as never,
        });
      }

      for (const candidateId of candidateRemovals) {
        await tx.tripAttractionExploreCandidate.deleteMany({
          where: { id: candidateId, tripId: input.tripId },
        });
      }

      for (const itemId of itemRemovals) {
        const item = await tx.itineraryItem.findFirst({
          where: {
            id: itemId,
            TripDay: { tripId: input.tripId },
          },
          select: {
            id: true,
            isPaid: true,
            bookedAt: true,
            bookingStatus: true,
          },
        });
        if (!item) {
          throw new Error(`ITEM_NOT_FOUND:${itemId}`);
        }
        if (item.isPaid || item.bookedAt) {
          throw new Error(`ITEM_BOOKED_OR_PAID:${itemId}`);
        }
        const bs = String(item.bookingStatus ?? '').toUpperCase();
        if (bs && !['NONE', 'UNBOOKED', 'DRAFT', ''].includes(bs)) {
          throw new Error(`ITEM_BOOKING_STATUS:${itemId}:${bs}`);
        }
        await tx.itineraryItem.delete({ where: { id: itemId } });
      }

      for (const r of itemReorders) {
        const itemId = String(r.itemId).trim();
        const item = await tx.itineraryItem.findFirst({
          where: {
            id: itemId,
            TripDay: { tripId: input.tripId },
          },
          select: {
            id: true,
            isPaid: true,
            bookedAt: true,
            bookingStatus: true,
          },
        });
        if (!item) {
          throw new Error(`ITEM_NOT_FOUND:${itemId}`);
        }
        if (item.isPaid || item.bookedAt) {
          throw new Error(`ITEM_BOOKED_OR_PAID:${itemId}`);
        }
        const bs = String(item.bookingStatus ?? '').toUpperCase();
        if (bs && !['NONE', 'UNBOOKED', 'DRAFT', ''].includes(bs)) {
          throw new Error(`ITEM_BOOKING_STATUS:${itemId}:${bs}`);
        }
        await tx.itineraryItem.update({
          where: { id: itemId },
          data: { order: Math.floor(r.order) },
        });
      }

      const nextRev = observedRev + 1;
      idemMap[input.idempotencyKey] = 'APPLIED';
      meta.revision = nextRev;
      meta.uwcItineraryCanaryIdem = idemMap;

      await tx.trip.update({
        where: { id: input.tripId },
        data: {
          metadata: meta as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      return { kind: 'applied' as const, nextRev };
    });

    if (applied.kind === 'replay') {
      return result({
        outcome: 'IDEMPOTENT_REPLAY',
        reasonCodes: ['ALREADY_APPLIED', UWC_ITINERARY_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: { canary: true, dualExecution: false },
      });
    }
    if (applied.kind === 'conflict') {
      return result({
        outcome: 'CONFLICT',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FRESHNESS_CONFLICT,
        reasonCodes: [...applied.reasonCodes, UWC_ITINERARY_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: {
          canary: true,
          dualExecution: false,
          transaction: 'aborted',
        },
      });
    }
    if (applied.kind === 'reject') {
      return result({
        outcome: 'REJECTED',
        errorCode: applied.errorCode,
        reasonCodes: [...applied.reasonCodes, UWC_ITINERARY_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: {
          canary: true,
          dualExecution: false,
          transaction: 'aborted',
        },
      });
    }

    return result({
      outcome: 'APPLIED',
      reasonCodes: [
        'AUTHORITATIVE_CANARY_APPLIED',
        'RESOURCE_VERSION_SET_OCC',
        'DB_TRANSACTION_COMMITTED',
        'NO_DUAL_EXECUTION',
        'COMPENSATION_EXEC_AUTHORIZED',
        itemCreates.length && timeUpdates.length
          ? isReduceIntensity
            ? 'SAME_DAY_REDUCE_INTENSITY'
            : 'SAME_DAY_MOVE_AND_ADD'
          : itemCreates.length
            ? candidateRemovals.length
              ? isMultiDayFromCandidates
                ? 'MULTI_DAY_ADD_FROM_CANDIDATES'
                : 'SAME_DAY_ADD_FROM_CANDIDATES'
              : 'SAME_DAY_ADD_ITEM'
            : itemRemovals.length
              ? 'SAME_DAY_REMOVE_ITEM'
              : itemReorders.length
                ? 'SAME_DAY_REORDER_ITEMS'
                : 'SAME_DAY_TIME_ADJUST',
        ...(candidateRemovals.length ? (['CANDIDATE_POOL_DELETE'] as const) : []),
        ...(itemCreates.length && timeUpdates.length
          ? (['ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN'] as const)
          : []),
        ...(isMultiDayFromCandidates
          ? (['ATOMIC_COMPOSITE_NO_CORRIDOR_CHAIN'] as const)
          : []),
        UWC_ITINERARY_CANARY_MODE,
      ],
      writeTargetsTouched: [
        { kind: 'trip_itinerary_item', durability: 'always' },
        { kind: 'trip_metadata', durability: 'always' },
      ],
      idempotencyKey: input.idempotencyKey,
      appliedRefs: { tripRevision: applied.nextRev },
      corridorResult: {
        canary: true,
        dualExecution: false,
        writesPerformed: true,
        writeTargets: candidateRemovals.length
          ? ['Trip', 'ItineraryItem', 'TripAttractionExploreCandidate']
          : ['Trip', 'ItineraryItem'],
        candidateRemovals: candidateRemovals.length,
        itemReorders: itemReorders.length,
        moveAndAdd: Boolean(
          itemCreates.length && timeUpdates.length && !isReduceIntensity,
        ),
        reduceIntensity: Boolean(
          itemCreates.length && timeUpdates.length && isReduceIntensity,
        ),
        multiDayFromCandidates: isMultiDayFromCandidates,
        transaction: 'committed',
      },
    });
  } catch (err) {
    // Prisma aborts the transaction — TRANSACTION_ABORT layer only (no compensating undo).
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('ITEM_BOOKED') || msg.startsWith('ITEM_BOOKING')) {
      return result({
        outcome: 'REJECTED',
        errorCode: AUTHORITATIVE_WRITE_ERROR_CODES.FORBIDDEN_CAPABILITY,
        reasonCodes: [msg, 'TRANSACTION_ABORT', UWC_ITINERARY_CANARY_MODE],
        writeTargetsTouched: [],
        idempotencyKey: input.idempotencyKey,
        corridorResult: { canary: true, dualExecution: false, transaction: 'aborted' },
      });
    }
    // Technical failure — caller may fallback only if no side effects started (txn aborted ⇒ none).
    throw err;
  }
}
