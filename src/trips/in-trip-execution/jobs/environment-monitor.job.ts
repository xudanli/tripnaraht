import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripStatus } from '../../dto/trip-status.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isInTripEnvironmentMonitorEnabled,
  isInTripExecutionEnabled,
} from '../utils/in-trip-config.util';
import { EnvironmentRadarService } from '../services/environment-radar.service';

@Injectable()
export class EnvironmentMonitorJob {
  private readonly logger = new Logger(EnvironmentMonitorJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly radar: EnvironmentRadarService,
  ) {}

  @Cron('*/30 * * * *', { name: 'in-trip-environment-monitor' })
  async handleCron(): Promise<void> {
    if (!isInTripExecutionEnabled() || !isInTripEnvironmentMonitorEnabled()) {
      return;
    }
    if (this.running) {
      this.logger.debug('skip — previous scan still running');
      return;
    }

    this.running = true;
    try {
      const now = new Date();
      const trips = await this.prisma.trip.findMany({
        where: {
          status: TripStatus.TRAVELING,
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: { id: true },
      });

      let totalCreated = 0;
      for (const trip of trips) {
        try {
          const n = await this.radar.scanTripEnvironment(trip.id);
          totalCreated += n;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`scan failed trip=${trip.id}: ${msg}`);
        }
      }

      if (trips.length > 0) {
        this.logger.log(
          `environment scan done trips=${trips.length} newEvents=${totalCreated}`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
