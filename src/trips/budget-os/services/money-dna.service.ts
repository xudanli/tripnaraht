import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { MoneyDnaProfile } from '../types/value-feedback.types';
import { deriveMoneyDnaFromFeedbacks } from '../utils/value-score.util';
import { resolveDefaultStructurePercentages } from '../utils/structure-presets.util';
import { TripValueFeedbackService } from './trip-value-feedback.service';

@Injectable()
export class MoneyDnaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valueFeedbackService: TripValueFeedbackService,
  ) {}

  async getProfile(userId: string): Promise<MoneyDnaProfile | null> {
    const row = await this.prisma.userMoneyDna.findUnique({
      where: { userId },
    });
    if (!row) return null;

    const profile: MoneyDnaProfile = {
      userId: row.userId,
      experienceSensitivity: row.experienceSensitivity,
      accommodationSensitivity: row.accommodationSensitivity,
      efficiencySensitivity: row.efficiencySensitivity,
      frugalityIndex: row.frugalityIndex,
      dominantPersona: row.dominantPersona as MoneyDnaProfile['dominantPersona'],
      tripCount: row.tripCount,
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
      confidence: row.confidence,
    };

    return this.enrichWithDefaultStructure(profile);
  }

  private enrichWithDefaultStructure(profile: MoneyDnaProfile): MoneyDnaProfile {
    const defaultStructure = resolveDefaultStructurePercentages(profile);
    return {
      ...profile,
      defaultStructure: {
        mode: 'percent',
        ...defaultStructure,
      },
    };
  }

  async recomputeForUser(userId: string): Promise<MoneyDnaProfile> {
    const feedbackRows = await this.valueFeedbackService.listFeedbackRowsForUser(userId);
    if (feedbackRows.length === 0) {
      throw new NotFoundException('无价值反馈数据，无法计算 Money DNA');
    }
    const tripIds = await this.valueFeedbackService.getDistinctTripIdsForUser(userId);

    const { profile } = deriveMoneyDnaFromFeedbacks(
      userId,
      feedbackRows.map((r) => ({
        tripId: r.tripId,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        amount: r.amount,
        category: r.category,
        satisfaction: r.satisfaction,
        createdBy: r.createdBy,
      })),
      tripIds,
    );

    const row = await this.prisma.userMoneyDna.upsert({
      where: { userId },
      create: {
        userId,
        ...profile,
        lastUpdatedAt: new Date(profile.lastUpdatedAt),
      },
      update: {
        ...profile,
        lastUpdatedAt: new Date(profile.lastUpdatedAt),
      },
    });

    return this.enrichWithDefaultStructure({
      userId: row.userId,
      experienceSensitivity: row.experienceSensitivity,
      accommodationSensitivity: row.accommodationSensitivity,
      efficiencySensitivity: row.efficiencySensitivity,
      frugalityIndex: row.frugalityIndex,
      dominantPersona: row.dominantPersona as MoneyDnaProfile['dominantPersona'],
      tripCount: row.tripCount,
      lastUpdatedAt: row.lastUpdatedAt.toISOString(),
      confidence: row.confidence,
    });
  }

  /**
   * Recompute Money DNA for all users who submitted value feedback on a completed trip.
   */
  async recomputeForTrip(tripId: string): Promise<void> {
    const userIds = await this.valueFeedbackService.getUserIdsWithFeedbackOnTrip(tripId);
    for (const userId of userIds) {
      try {
        await this.recomputeForUser(userId);
      } catch {
        // non-blocking per user
      }
    }
  }

  async requireProfile(userId: string): Promise<MoneyDnaProfile> {
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('尚未生成 Money DNA，请先完成行程价值反馈');
    }
    return profile;
  }
}
