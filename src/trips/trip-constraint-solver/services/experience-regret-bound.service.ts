/**
 * 体验底线确认 — Readiness P0
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  readExperienceUnderstanding,
  TRIP_EXPERIENCE_REGRET_BOUND_METADATA_KEY,
  type ExperienceRegretConfirmInput,
  type ExperienceRegretBoundStore,
} from '../utils/experience-regret-bound.util';

const ALLOWED_BOUNDS = new Set([0.15, 0.3, 0.45]);

@Injectable()
export class ExperienceRegretBoundService {
  constructor(private readonly prisma: PrismaService) {}

  async confirmBound(
    tripId: string,
    userId: string,
    input: ExperienceRegretConfirmInput,
  ): Promise<{ tripId: string; experienceRegretBound: ExperienceRegretBoundStore }> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    if (!readExperienceUnderstanding(trip.metadata)) {
      throw new NotFoundException(
        'legacy 行程无 experienceUnderstanding，无需确认体验底线',
      );
    }

    if (!ALLOWED_BOUNDS.has(input.confirmedUpperBound)) {
      throw new BadRequestException('confirmedUpperBound 须为 0.15 | 0.3 | 0.45');
    }

    const experienceRegretBound: ExperienceRegretBoundStore = {
      revision: 1,
      confirmedUpperBound: input.confirmedUpperBound,
      confirmedAt: new Date().toISOString(),
      confirmedBy: userId,
      statements: input.statements,
      confirmationMode: input.confirmationMode ?? 'organizer_only',
    };

    const metadata = {
      ...(typeof trip.metadata === 'object' && trip.metadata ? trip.metadata : {}),
      [TRIP_EXPERIENCE_REGRET_BOUND_METADATA_KEY]: experienceRegretBound,
    };

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { metadata },
    });

    return { tripId, experienceRegretBound };
  }
}
