import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { TripStatus } from '../../dto/trip-status.dto';
import { TripBudgetProfileService } from '../../budget-os/services/trip-budget-profile.service';
import { TravelWalletService } from '../../budget-os/services/travel-wallet.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  InTripMorningPack,
  OfflineQueueEntryPublic,
} from '../types/in-trip-offline.types';
import { IN_TRIP_MORNING_PACK_SCHEMA_VERSION } from '../types/in-trip-offline.types';
import { defaultTripTimezone, isInTripExecutionEnabled } from '../utils/in-trip-config.util';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { VulnerabilityScoreService } from './vulnerability-score.service';
import { InTripPoiAccessMorningService } from '../../../poi-access-capacity/services/in-trip-poi-access-morning.service';

@Injectable()
export class InTripMorningPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly vulnerability: VulnerabilityScoreService,
    private readonly budgetProfile: TripBudgetProfileService,
    private readonly wallet: TravelWalletService,
    private readonly poiAccessMorning: InTripPoiAccessMorningService,
  ) {}

  async buildForTrip(tripId: string, userId?: string): Promise<InTripMorningPack | null> {
    if (!isInTripExecutionEnabled()) return null;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { status: true, startDate: true, endDate: true, destination: true },
    });
    if (!trip || trip.status !== TripStatus.TRAVELING) return null;

    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const anchorSummary = anchor ? this.anchorHandoff.toPublicSnapshot(anchor) : null;

    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);
    const tz = defaultTripTimezone(trip.destination);
    const date =
      DateTime.fromJSDate(trip.startDate, { zone: tz })
        .plus({ days: dayNumber - 1 })
        .toISODate() ?? new Date().toISOString().slice(0, 10);

    const todayItems =
      anchor?.itinerary.days.find((d) => d.date === date)?.items ??
      anchor?.itinerary.days[dayNumber - 1]?.items ??
      [];

    const scores = await this.vulnerability.listScores(tripId);
    const todayVuln = this.vulnerability.getTodayScore(scores, dayNumber);

    let budgetSnapshot: InTripMorningPack['budgetSnapshot'] = {
      overallUsagePercent: null,
      currency: 'CNY',
      dailyBudget: null,
    };
    try {
      const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
      budgetSnapshot = {
        overallUsagePercent:
          profile.actuals?.budgetUsagePercent != null
            ? Math.round(profile.actuals.budgetUsagePercent)
            : null,
        currency: profile.intent?.currency ?? 'CNY',
        dailyBudget: profile.intent?.dailyBudget ?? null,
      };
    } catch {
      // optional
    }

    let walletBalances = null;
    try {
      walletBalances = await this.wallet.getBalances(tripId);
    } catch {
      // optional
    }

    const pendingOperations = await this.listPendingOperations(tripId, userId);

    let poiAccessAlerts: InTripMorningPack['poiAccessAlerts'] = [];
    try {
      poiAccessAlerts = await this.poiAccessMorning.buildAlertsForDay({
        dateISO: date,
        timezone: tz,
        items: todayItems,
      });
    } catch {
      poiAccessAlerts = [];
    }

    return {
      schemaVersion: IN_TRIP_MORNING_PACK_SCHEMA_VERSION,
      syncedAt: new Date().toISOString(),
      anchorSummary,
      todayTimeline: { dayNumber, date, items: todayItems },
      vulnerability: todayVuln,
      budgetSnapshot,
      walletBalances,
      pendingOperations,
      ...(poiAccessAlerts?.length ? { poiAccessAlerts } : {}),
    };
  }

  private async listPendingOperations(
    tripId: string,
    userId?: string,
  ): Promise<OfflineQueueEntryPublic[]> {
    const rows = await this.prisma.tripInTripOfflineQueueEntry.findMany({
      where: {
        tripId,
        syncedAt: null,
        ...(userId ? { userId } : {}),
      },
      orderBy: { clientSeq: 'asc' },
      take: 50,
    });

    return rows.map((r) => ({
      id: r.id,
      operationType: r.operationType as OfflineQueueEntryPublic['operationType'],
      clientSeq: r.clientSeq.toString(),
      recordedAt: r.recordedAt.toISOString(),
      conflictStatus: r.conflictStatus,
      syncedAt: r.syncedAt?.toISOString() ?? null,
    }));
  }
}
