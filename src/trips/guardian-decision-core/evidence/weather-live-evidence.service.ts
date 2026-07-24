/**
 * Slice 2 — live weather observation → hazard payload (optional DataContracts).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import {
  resolveTripDayLocation,
  windMsToKmh,
} from '../adapters/weather-trip-day.util';

export interface TripDayWindObservation {
  dayIndex: number;
  regionId: string;
  lat: number;
  lng: number;
  windSpeedKmh: number;
  windGustKmh?: number;
  sourceProvider: 'iceland_met' | 'global_weather';
}

@Injectable()
export class WeatherLiveEvidenceService {
  private readonly logger = new Logger(WeatherLiveEvidenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dataSourceRouter?: DataSourceRouterService,
  ) {}

  async fetchWindForTripDay(
    tripId: string,
    dayIndex: number,
  ): Promise<TripDayWindObservation | null> {
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) return null;

    const location = resolveTripDayLocation(plan, dayIndex);
    if (!location) {
      this.logger.warn(
        `fetchWindForTripDay: no coordinates for trip=${tripId} day=${dayIndex}`,
      );
      return null;
    }

    if (!this.dataSourceRouter) {
      this.logger.warn(
        'fetchWindForTripDay: DataSourceRouterService unavailable',
      );
      return null;
    }

    const day = plan.segments?.find((s) => s.dayIndex === dayIndex);
    const dateStr =
      typeof (day?.metadata as { date?: string })?.date === 'string'
        ? (day!.metadata as { date: string }).date
        : new Date().toISOString().slice(0, 10);

    try {
      const raw = await this.dataSourceRouter.getWeatherEvidence({
        lat: location.lat,
        lng: location.lng,
        date: dateStr,
        includeWindDetails: true,
      });
      if (!raw.freshness.strongJudgmentAllowed) {
        this.logger.warn(
          `weather stale trip=${tripId} day=${dayIndex} status=${raw.freshness.status}`,
        );
      }
      const weather = raw.value as {
        windSpeed?: number;
        windGust?: number;
        source?: string;
      };
      const windSpeedMs = weather.windSpeed ?? 0;
      const windGustMs = weather.windGust;
      return {
        dayIndex,
        regionId: location.regionId,
        lat: location.lat,
        lng: location.lng,
        windSpeedKmh: windMsToKmh(windSpeedMs),
        windGustKmh: windGustMs != null ? windMsToKmh(windGustMs) : undefined,
        sourceProvider: String(weather.source ?? '').toLowerCase().includes('iceland')
          ? 'iceland_met'
          : 'global_weather',
      };
    } catch (err) {
      this.logger.warn(
        `fetchWindForTripDay failed trip=${tripId} day=${dayIndex}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }
}
