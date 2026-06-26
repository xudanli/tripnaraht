import {
  BadRequestException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import { AnchorHandoffService } from '../../in-trip-execution/services/anchor-handoff.service';
import { EnvironmentRadarService } from '../../in-trip-execution/services/environment-radar.service';
import { InTripAccessService } from '../../in-trip-execution/services/in-trip-access.service';
import { isInTripExecutionEnabled } from '../../in-trip-execution/utils/in-trip-config.util';
import { TripStatus, normalizeTripStatus } from '../../dto/trip-status.dto';
import type { TripExecutionAdvisoryDto } from '../types/trip-constraint-solver.types';
import { buildExecutionAdvisory } from '../utils/execution-advisory-assembler.util';

@Injectable()
export class ExecutionAdvisoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    @Optional() private readonly anchorHandoff?: AnchorHandoffService,
    @Optional() private readonly environmentRadar?: EnvironmentRadarService,
    @Optional() private readonly coverageMap?: CoverageMapService,
  ) {}

  async getAdvisory(tripId: string, userId: string): Promise<TripExecutionAdvisoryDto> {
    if (!isInTripExecutionEnabled()) {
      throw new ServiceUnavailableException({
        code: 'EXECUTION_ADVISORY_DISABLED',
        message: '行中执行守护模块未启用',
      });
    }

    const trip = await this.access.requireTrip(tripId);
    await this.access.assertTripMember(tripId, userId);
    const status = normalizeTripStatus(trip.status);
    if (status !== TripStatus.TRAVELING) {
      throw new BadRequestException({
        code: 'EXECUTION_ADVISORY_NOT_IN_TRIP',
        message: `行中守护要求行程处于 TRAVELING，当前为 ${status}`,
      });
    }

    const dayNumber = this.resolveDayNumber(trip.startDate, trip.endDate);
    const tripDay = await this.prisma.tripDay.findFirst({
      where: { tripId },
      orderBy: { date: 'asc' },
      skip: Math.max(0, dayNumber - 1),
    });
    const date = tripDay?.date
      ? DateTime.fromJSDate(tripDay.date).toISODate() ?? ''
      : DateTime.fromJSDate(trip.startDate).plus({ days: dayNumber - 1 }).toISODate() ?? '';

    const anchor = this.anchorHandoff ? await this.anchorHandoff.getSnapshot(tripId) : null;
    const todayReadiness = this.coverageMap
      ? await this.coverageMap.getTodayReadinessScore(tripId, dayNumber).catch(() => null)
      : null;
    const environmentEvents = this.environmentRadar
      ? await this.environmentRadar.listOpenEvents(tripId, userId).catch(() => [])
      : [];

    const meta = (trip.metadata ?? {}) as Record<string, unknown>;
    const delayMinutes = typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;

    return buildExecutionAdvisory({
      tripId,
      tripDayId: tripDay?.id ?? `day-${dayNumber}`,
      dayNumber,
      date,
      anchor,
      todayReadiness,
      environmentEvents,
      delayMinutes,
      timezone: typeof meta.timezone === 'string' ? meta.timezone : 'Atlantic/Reykjavik',
    });
  }

  private resolveDayNumber(startDate: Date, endDate: Date): number {
    const now = DateTime.now();
    const start = DateTime.fromJSDate(startDate).startOf('day');
    const end = DateTime.fromJSDate(endDate).startOf('day');
    if (now < start) return 1;
    if (now > end) return Math.max(1, Math.floor(end.diff(start, 'days').days) + 1);
    return Math.max(1, Math.floor(now.diff(start, 'days').days) + 1);
  }
}
