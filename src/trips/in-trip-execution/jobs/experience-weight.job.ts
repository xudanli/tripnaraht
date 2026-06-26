import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TripStatus } from '../../dto/trip-status.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isInTripExecutionEnabled,
  isInTripExperienceLoopEnabled,
} from '../utils/in-trip-config.util';
import { RecommendationWeightService } from '../services/recommendation-weight.service';

@Injectable()
export class ExperienceWeightJob {
  private readonly logger = new Logger(ExperienceWeightJob.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly weights: RecommendationWeightService,
  ) {}

  /** 每日 22:00 UTC 近似各目的地晚间权重调整（Phase 1） */
  @Cron('0 22 * * *', { name: 'in-trip-experience-weight' })
  async handleCron(): Promise<void> {
    if (!isInTripExecutionEnabled() || !isInTripExperienceLoopEnabled()) return;
    if (this.running) return;

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

      for (const trip of trips) {
        try {
          const patch = await this.weights.adjustNightly(trip.id);
          if (patch) {
            this.logger.log(`weight adjusted for trip ${trip.id}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`weight job failed for ${trip.id}: ${msg}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
