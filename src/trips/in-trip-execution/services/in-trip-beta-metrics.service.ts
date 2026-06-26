import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripStatus } from '../../dto/trip-status.dto';
import type { InTripBetaMetrics } from '../types/in-trip-offline.types';

@Injectable()
export class InTripBetaMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCohortMetrics(destinationFilter?: string): Promise<InTripBetaMetrics> {
    const cohortLabel = destinationFilter?.trim() || 'iceland-beta-50';
    const now = new Date();
    const todayStart = DateTime.utc().startOf('day').toJSDate();

    const tripWhere = {
      ...(destinationFilter
        ? { destination: { contains: destinationFilter, mode: 'insensitive' as const } }
        : {}),
    };

    const [activeTrips, completedTrips, travelingTripIds] = await Promise.all([
      this.prisma.trip.count({
        where: { ...tripWhere, status: TripStatus.TRAVELING },
      }),
      this.prisma.trip.count({
        where: {
          ...tripWhere,
          status: TripStatus.COMPLETED,
          updatedAt: { gte: DateTime.utc().minus({ days: 90 }).toJSDate() },
        },
      }),
      this.prisma.trip.findMany({
        where: { ...tripWhere, status: TripStatus.TRAVELING },
        select: { id: true },
      }),
    ]);

    const tripIds = travelingTripIds.map((t) => t.id);

    const [
      anchorCount,
      redEvents,
      resolvedRed,
      envEventsWithDelay,
      txToday,
      txTotal,
      nudgedTxRaw,
      moodToday,
      memberCount,
      pendingInterventions,
      pulsesToday,
      pendingPulsesEstimate,
      offlinePending,
      offlineSyncedToday,
      offlineConflicts,
    ] = await Promise.all([
      tripIds.length
        ? this.prisma.tripInTripAnchorSnapshot.count({ where: { tripId: { in: tripIds } } })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripEnvironmentEvent.count({
            where: { tripId: { in: tripIds }, severity: 'red', status: 'open' },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripEnvironmentEvent.count({
            where: {
              tripId: { in: tripIds },
              severity: 'red',
              status: 'resolved',
              resolvedAt: { not: null },
            },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripEnvironmentEvent.findMany({
            where: {
              tripId: { in: tripIds },
              sourceObservedAt: { not: null },
            },
            select: { detectedAt: true, sourceObservedAt: true },
            take: 200,
          })
        : Promise.resolve([]),
      tripIds.length
        ? this.prisma.tripSmartTransaction.count({
            where: { tripId: { in: tripIds }, recordedAt: { gte: todayStart } },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripSmartTransaction.count({ where: { tripId: { in: tripIds } } })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripSmartTransaction.findMany({
            where: { tripId: { in: tripIds } },
            select: { nudgesTriggered: true },
          })
        : Promise.resolve([]),
      tripIds.length
        ? this.prisma.tripMoodCheck.count({
            where: { tripId: { in: tripIds }, createdAt: { gte: todayStart } },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripCollaborator.count({ where: { tripId: { in: tripIds } } })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripProtectiveIntervention.count({
            where: { tripId: { in: tripIds }, status: 'pending' },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripExperiencePulse.count({
            where: { tripId: { in: tripIds }, submittedAt: { gte: todayStart } },
          })
        : Promise.resolve(0),
      tripIds.length
        ? this.prisma.tripExperiencePulse.count({ where: { tripId: { in: tripIds } } })
        : Promise.resolve(0),
      this.prisma.tripInTripOfflineQueueEntry.count({ where: { syncedAt: null } }),
      this.prisma.tripInTripOfflineQueueEntry.count({
        where: { syncedAt: { gte: todayStart } },
      }),
      this.prisma.tripInTripOfflineQueueEntry.count({
        where: { conflictStatus: 'manual_review' },
      }),
    ]);

    const nudgedTx = Array.isArray(nudgedTxRaw)
      ? nudgedTxRaw.filter(
          (r) => Array.isArray(r.nudgesTriggered) && r.nudgesTriggered.length > 0,
        ).length
      : 0;

    const totalRed = redEvents + resolvedRed;
    const adoptionRate = totalRed > 0 ? resolvedRed / totalRed : null;

    const delays = envEventsWithDelay
      .filter((e) => e.sourceObservedAt)
      .map(
        (e) =>
          (e.detectedAt.getTime() - (e.sourceObservedAt as Date).getTime()) / 60_000,
      )
      .filter((m) => m >= 0 && m < 24 * 60);
    const avgDetectionDelayMinutes =
      delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null;

    const avgTransactionsPerTrip =
      tripIds.length > 0 ? Math.round((txTotal / tripIds.length) * 10) / 10 : 0;

    const nudgeTriggerRate =
      txTotal > 0 ? Math.round((nudgedTx / txTotal) * 1000) / 1000 : null;

    const expectedMoodChecks = Math.max(memberCount, 1);
    const moodParticipationRate =
      tripIds.length > 0
        ? Math.round((moodToday / expectedMoodChecks) * 1000) / 1000
        : null;

    const pulseCompletionRate =
      pendingPulsesEstimate > 0
        ? Math.round((pulsesToday / pendingPulsesEstimate) * 1000) / 1000
        : null;

    return {
      cohortLabel,
      generatedAt: now.toISOString(),
      activeTrips,
      completedTrips,
      anchorMaterializationRate:
        tripIds.length > 0 ? Math.round((anchorCount / tripIds.length) * 1000) / 1000 : 0,
      environment: {
        openRedEvents: redEvents,
        adoptionRate,
        avgDetectionDelayMinutes,
      },
      money: {
        transactionsToday: txToday,
        avgTransactionsPerTrip,
        nudgeTriggerRate,
      },
      groupPulse: {
        moodChecksToday: moodToday,
        moodParticipationRate,
        pendingInterventions,
      },
      experience: {
        pulsesSubmittedToday: pulsesToday,
        pulseCompletionRate,
      },
      offline: {
        pendingQueueEntries: offlinePending,
        syncedToday: offlineSyncedToday,
        conflictCount: offlineConflicts,
      },
    };
  }
}
