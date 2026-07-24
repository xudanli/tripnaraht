import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FactsToReadinessCompiler } from '../trips/readiness/compilers/facts-to-readiness.compiler';
import { prismaRowToCountryFacts } from '../countries/country-profile-v2.mapper';
import { getCountryPack } from '../trips/readiness/config/country-pack.config';
import { LAUGAVEGUR_GEAR_CHECKLIST } from './constants/laugavegur-gear-checklist';
import { extractTripHikingContext, tripHasHikingActivity } from './utils/trip-hiking-context.util';
import {
  compareTripAndRouteDays,
  computeTripPlannedDays,
  type DaysAlignment,
} from './utils/trip-duration.util';
import { IS_LAUGAVEGUR_PHILOSOPHY } from '../route-directions/fixtures/is_laugavegur.fixture';
import { HikingTrailDetailService } from './services/hiking-trail-detail.service';
import type { TripContext } from '../trips/readiness/types/trip-context.types';

export type HikingReadinessAuditResult = {
  tripId: string;
  eligible: boolean;
  hikingDetected: boolean;
  routeDirectionId?: number;
  routeDirectionName?: string;
  /** 本次行程计划天数（TripDay 数或 start/end 日期差） */
  tripPlannedDays: number;
  /** 关联路线 hikingDetail 建议天数；无法解析路线时为 undefined */
  routeSuggestedDays?: number;
  /** tripPlannedDays - routeSuggestedDays */
  daysDelta?: number;
  daysAlignment: DaysAlignment;
  /** 关联的 HikePlan（若有） */
  hikePlanId?: string;
  terrainThresholds: Record<string, number | undefined>;
  readinessMust: Array<{ id: string; message: string }>;
  gearChecklist: typeof LAUGAVEGUR_GEAR_CHECKLIST;
  fixtureRules?: string[];
};

@Injectable()
export class HikingReadinessAuditService {
  private readonly logger = new Logger(HikingReadinessAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factsCompiler: FactsToReadinessCompiler,
    private readonly trailDetail: HikingTrailDetailService,
  ) {}

  async auditTrip(
    tripId: string,
    options?: { longestHike?: number },
  ): Promise<HikingReadinessAuditResult> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          include: { ItineraryItem: true },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    const hikingCtx = extractTripHikingContext(trip);
    const hikingDetected = tripHasHikingActivity(hikingCtx);

    const iso =
      hikingCtx.countryCodes[0] ??
      (typeof trip.destination === 'string' && trip.destination.length === 2
        ? trip.destination.toUpperCase()
        : 'IS');

    const pack = getCountryPack(iso);
    const terrainThresholds: Record<string, number | undefined> = {
      ...pack.riskThresholds,
    };

    let readinessMust: Array<{ id: string; message: string }> = [];
    if (hikingDetected) {
      try {
        const profile = await this.prisma.countryProfile.findUnique({
          where: { isoCode: iso },
        });
        if (profile) {
          const facts = prismaRowToCountryFacts(profile);
          const context: TripContext = {
            traveler: { nationality: 'CN' },
            trip: {
              startDate: trip.startDate?.toISOString().slice(0, 10),
              endDate: trip.endDate?.toISOString().slice(0, 10),
            },
            itinerary: {
              countries: [iso],
              activities: hikingCtx.activities.length
                ? hikingCtx.activities
                : ['hiking'],
            },
          };
          const finding = this.factsCompiler.compileHikingTerrainAndGear(facts, context);
          readinessMust = finding.map((item) => ({
            id: item.id,
            message: item.message,
          }));
        }
      } catch (e) {
        this.logger.warn(`Hiking readiness compile skipped: ${e}`);
      }
    }

    const tripPlannedDays = computeTripPlannedDays(trip);
    const hikePlan = await this.prisma.hikePlan.findFirst({
      where: { tripId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, routeDirectionId: true },
    });

    const routeDirectionId = await this.resolveRouteDirectionId(hikingCtx, hikePlan);
    let routeSuggestedDays: number | undefined;
    let routeDirectionName = hikingCtx.routeDirectionName;

    if (routeDirectionId != null) {
      const rd = await this.prisma.routeDirection.findUnique({
        where: { id: routeDirectionId },
      });
      if (rd) {
        routeDirectionName = rd.name;
        const longestHike =
          options?.longestHike != null
            ? (Math.min(4, Math.max(0, options.longestHike)) as 0 | 1 | 2 | 3 | 4)
            : undefined;
        const detail = await this.trailDetail.build(rd, { longestHike });
        routeSuggestedDays =
          detail?.summary.suggestedDays ??
          detail?.fitnessMatch?.suggestedDays ??
          detail?.daySkeleton?.length;
      }
    }

    const { daysDelta, daysAlignment } = compareTripAndRouteDays(
      tripPlannedDays,
      routeSuggestedDays,
    );

    if (daysAlignment === 'trip_longer' && routeSuggestedDays != null) {
      readinessMust.push({
        id: 'TRIP_DAYS_LONGER_THAN_ROUTE',
        message: `本次行程计划 ${tripPlannedDays} 天，路线建议 ${routeSuggestedDays} 天，请核对日骨架与体能节奏`,
      });
    } else if (daysAlignment === 'trip_shorter' && routeSuggestedDays != null) {
      readinessMust.push({
        id: 'TRIP_DAYS_SHORTER_THAN_ROUTE',
        message: `本次行程计划 ${tripPlannedDays} 天，路线建议 ${routeSuggestedDays} 天，可能无法覆盖全程`,
      });
    }

    const routeName = routeDirectionName ?? hikingCtx.routeDirectionName ?? 'IS_LAUGAVEGUR';
    const fixtureRules =
      routeName === 'IS_LAUGAVEGUR'
        ? IS_LAUGAVEGUR_PHILOSOPHY.nonNegotiableRules
        : undefined;

    const gearChecklist =
      routeName === 'IS_LAUGAVEGUR' || iso === 'IS'
        ? LAUGAVEGUR_GEAR_CHECKLIST
        : LAUGAVEGUR_GEAR_CHECKLIST;

    return {
      tripId,
      eligible: hikingDetected,
      hikingDetected,
      routeDirectionId,
      routeDirectionName: routeDirectionName ?? hikingCtx.routeDirectionName,
      tripPlannedDays,
      routeSuggestedDays,
      daysDelta,
      daysAlignment,
      hikePlanId: hikePlan?.id,
      terrainThresholds,
      readinessMust,
      gearChecklist,
      fixtureRules,
    };
  }

  private async resolveRouteDirectionId(
    hikingCtx: ReturnType<typeof extractTripHikingContext>,
    hikePlan?: { routeDirectionId: number } | null,
  ): Promise<number | undefined> {
    if (hikingCtx.routeDirectionId != null) return hikingCtx.routeDirectionId;
    if (hikePlan?.routeDirectionId != null) return hikePlan.routeDirectionId;

    if (hikingCtx.routeDirectionName) {
      const rd = await this.prisma.routeDirection.findFirst({
        where: { name: hikingCtx.routeDirectionName },
        select: { id: true },
      });
      return rd?.id;
    }

    return undefined;
  }
}
