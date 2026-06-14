import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { NonTransactionalReplanResult } from '../../../travel-cognition';
import type { ReadinessCausalPreAnalysisSnapshot } from '../types/coverage-map.types';
import {
  extractCausalPreAnalysisSnapshot,
  mergeCausalPreAnalysisSnapshot,
} from '../utils/readiness-causal-preanalysis.util';

@Injectable()
export class ReadinessCausalPreanalysisService {
  private readonly logger = new Logger(ReadinessCausalPreanalysisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async loadSnapshot(tripId: string): Promise<ReadinessCausalPreAnalysisSnapshot | undefined> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return trip ? extractCausalPreAnalysisSnapshot(trip.metadata) : undefined;
  }

  async persistResult(
    tripId: string,
    result: NonTransactionalReplanResult,
    blockerId?: string,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return;

    try {
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: mergeCausalPreAnalysisSnapshot(trip.metadata, {
            result,
            blockerId,
          }),
        },
      });
    } catch (error) {
      this.logger.warn(
        `级联预分析持久化失败 trip=${tripId}: ${(error as Error).message}`,
      );
    }
  }
}
