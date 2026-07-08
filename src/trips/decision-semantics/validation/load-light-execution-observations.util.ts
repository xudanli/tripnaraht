/**
 * P2 — Load lightweight execution signals since a decision (no GPS trajectory).
 */

import type { PrismaService } from '../../../prisma/prisma.service';

export type LightExecutionSignalKind =
  | 'user_arrival_click'
  | 'itinerary_item_timing'
  | 'booking_checkin'
  | 'navigation_motion'
  | 'split_reunion_arrived';

export interface LightExecutionSignal {
  kind: LightExecutionSignalKind;
  observedAt: string;
  entityId?: string;
  value: string | number | boolean;
  rawSource: string;
}

const CHECKIN_BOOKING_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'CHECKED-IN', 'COMPLETED']);

export async function loadLightExecutionSignals(
  prisma: PrismaService,
  tripId: string,
  decidedAt: string,
): Promise<LightExecutionSignal[]> {
  const since = new Date(decidedAt);
  const signals: LightExecutionSignal[] = [];

  const [offlineOps, items, splitSessions, travelEvents] = await Promise.all([
    prisma.tripInTripOfflineQueueEntry.findMany({
      where: { tripId, recordedAt: { gte: since } },
      select: {
        operationType: true,
        payload: true,
        recordedAt: true,
        syncedAt: true,
      },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    }),
    prisma.itineraryItem.findMany({
      where: {
        TripDay: { tripId },
        OR: [
          { bookedAt: { gte: since } },
          { startTime: { gte: since } },
          { endTime: { gte: since } },
        ],
      },
      select: {
        id: true,
        bookedAt: true,
        bookingStatus: true,
        startTime: true,
        endTime: true,
      },
      take: 100,
    }),
    prisma.tripSplitPartySession.findMany({
      where: { tripId, executedAt: { gte: since } },
      select: { id: true, reunion: true, executedAt: true },
      take: 20,
    }),
    prisma.travelEvent.findMany({
      where: {
        tripId,
        occurredAt: { gte: since },
        eventType: {
          in: ['trip.itinerary.changed', 'trip.in_trip.split_executed'],
        },
      },
      select: { id: true, eventType: true, occurredAt: true, payload: true },
      orderBy: { occurredAt: 'desc' },
      take: 50,
    }),
  ]);

  for (const op of offlineOps) {
    const payload = (op.payload ?? {}) as Record<string, unknown>;
    const at = (op.syncedAt ?? op.recordedAt).toISOString();

    if (op.operationType === 'poi_execution_feedback' && payload.arrivalTime) {
      signals.push({
        kind: 'user_arrival_click',
        observedAt: at,
        entityId: String(payload.poiId ?? payload.placeId ?? ''),
        value: String(payload.arrivalTime),
        rawSource: 'offline:poi_execution_feedback',
      });
    }

    if (op.operationType === 'motion_signal') {
      const steps = Number(payload.steps ?? 0);
      if (steps > 0) {
        signals.push({
          kind: 'navigation_motion',
          observedAt: at,
          value: steps,
          rawSource: 'offline:motion_signal',
        });
      }
    }
  }

  for (const item of items) {
    if (item.bookedAt && item.bookedAt >= since) {
      signals.push({
        kind: 'booking_checkin',
        observedAt: item.bookedAt.toISOString(),
        entityId: item.id,
        value: item.bookingStatus ?? 'CONFIRMED',
        rawSource: 'itinerary:bookedAt',
      });
    } else if (
      item.bookingStatus &&
      CHECKIN_BOOKING_STATUSES.has(String(item.bookingStatus).toUpperCase())
    ) {
      signals.push({
        kind: 'booking_checkin',
        observedAt: item.bookedAt?.toISOString() ?? since.toISOString(),
        entityId: item.id,
        value: item.bookingStatus,
        rawSource: 'itinerary:bookingStatus',
      });
    }

    if (item.endTime && item.endTime >= since) {
      signals.push({
        kind: 'itinerary_item_timing',
        observedAt: item.endTime.toISOString(),
        entityId: item.id,
        value: 'completed',
        rawSource: 'itinerary:endTime',
      });
    } else if (item.startTime && item.startTime >= since) {
      signals.push({
        kind: 'itinerary_item_timing',
        observedAt: item.startTime.toISOString(),
        entityId: item.id,
        value: 'started',
        rawSource: 'itinerary:startTime',
      });
    }
  }

  for (const session of splitSessions) {
    const reunion = session.reunion as { status?: string; updatedAt?: string } | null;
    if (reunion?.status === 'arrived' || reunion?.status === 'completed') {
      signals.push({
        kind: 'split_reunion_arrived',
        observedAt: reunion.updatedAt ?? session.executedAt!.toISOString(),
        entityId: session.id,
        value: reunion.status,
        rawSource: 'split:reunion',
      });
    }
  }

  for (const ev of travelEvents) {
    signals.push({
      kind: 'navigation_motion',
      observedAt: ev.occurredAt.toISOString(),
      entityId: ev.id,
      value: ev.eventType,
      rawSource: `travel_event:${ev.eventType}`,
    });
  }

  return signals;
}
