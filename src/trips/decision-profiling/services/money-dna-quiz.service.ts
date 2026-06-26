import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MONEY_DNA_QUIZ_QUESTIONS } from '../config/money-dna-quiz.config';
import type {
  MoneyDnaCard,
  MoneyDnaCardSource,
  MoneyDnaCardTeamView,
  SubmitQuizPayload,
} from '../types/decision-profiling.types';
import {
  buildMoneyDnaCard,
  cosineSimilarity,
} from '../utils/money-dna-quiz-scorer.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { DecisionProfilingProfileService } from './decision-profiling-profile.service';

@Injectable()
export class MoneyDnaQuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
    private readonly profile: DecisionProfilingProfileService,
  ) {}

  getQuestions() {
    return MONEY_DNA_QUIZ_QUESTIONS;
  }

  async getMyCard(userId: string): Promise<MoneyDnaCard | null> {
    const row = await this.prisma.userMoneyDnaQuiz.findUnique({ where: { userId } });
    if (!row) return null;
    return this.mapRow(row);
  }

  async submitQuiz(userId: string, tripId: string, payload: SubmitQuizPayload): Promise<MoneyDnaCard> {
    await this.access.assertTripMember(tripId, userId);
    const card = buildMoneyDnaCard(userId, payload.answers, payload.userNote);
    const source: MoneyDnaCardSource = payload.userNote ? 'quiz_edited' : 'quiz';

    await this.prisma.userMoneyDnaQuiz.upsert({
      where: { userId },
      create: {
        userId,
        experienceTendency: card.vector.experienceTendency,
        qualityTendency: card.vector.qualityTendency,
        timeValueTendency: card.vector.timeValueTendency,
        socialScarcityTendency: card.vector.socialScarcityTendency,
        budgetRangeMin: card.budgetRangeMin ?? null,
        budgetRangeMax: card.budgetRangeMax ?? null,
        consumptionPace: card.consumptionPace,
        userNote: card.userNote ?? null,
        quizAnswers: toInputJsonValue(payload.answers),
        confidence: card.confidence,
        source,
        completedAt: new Date(card.completedAt),
      },
      update: {
        experienceTendency: card.vector.experienceTendency,
        qualityTendency: card.vector.qualityTendency,
        timeValueTendency: card.vector.timeValueTendency,
        socialScarcityTendency: card.vector.socialScarcityTendency,
        budgetRangeMin: card.budgetRangeMin ?? null,
        budgetRangeMax: card.budgetRangeMax ?? null,
        consumptionPace: card.consumptionPace,
        userNote: card.userNote ?? null,
        quizAnswers: toInputJsonValue(payload.answers),
        confidence: card.confidence,
        source,
        completedAt: new Date(card.completedAt),
      },
    });

    const cardWithSource = { ...card, source };
    const quizCompletedOnTrip = await this.upsertTripStatus(tripId, userId, {
      moneyDnaCompleted: true,
      moneyDnaSource: source,
    });

    await this.profile.upsertFromMoneyDnaQuiz(
      userId,
      tripId,
      payload.answers,
      cardWithSource,
      quizCompletedOnTrip,
    );

    return cardWithSource;
  }

  async getTeamSimilarity(
    tripId: string,
    viewerId: string,
  ): Promise<MoneyDnaCardTeamView[]> {
    await this.access.assertTripMember(tripId, viewerId);
    const memberIds = await this.access.listMemberIds(tripId);
    const names = await this.access.resolveDisplayNames(memberIds);
    const viewerCard = await this.getMyCard(viewerId);
    const rows = await this.prisma.userMoneyDnaQuiz.findMany({
      where: { userId: { in: memberIds } },
    });

    return rows
      .filter((r) => r.userId !== viewerId)
      .map((row) => {
        const card = this.mapRow(row);
        const sim = viewerCard
          ? cosineSimilarity(viewerCard.vector, card.vector)
          : 0;
        return {
          userId: card.userId,
          displayName: names.get(card.userId) ?? card.userId.slice(0, 8),
          styleSimilarityPct: Math.round(sim * 100),
        };
      });
  }

  private async upsertTripStatus(
    tripId: string,
    userId: string,
    patch: Partial<{
      travelStyleCompleted: boolean;
      moneyDnaCompleted: boolean;
      travelStyleSource: string;
      moneyDnaSource: string;
    }>,
  ): Promise<boolean> {
    const existing = await this.prisma.tripDecisionProfilingStatus.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    const travelStyleCompleted = patch.travelStyleCompleted ?? existing?.travelStyleCompleted ?? false;
    const moneyDnaCompleted = patch.moneyDnaCompleted ?? existing?.moneyDnaCompleted ?? false;
    const quizCompleted = travelStyleCompleted && moneyDnaCompleted;

    await this.prisma.tripDecisionProfilingStatus.upsert({
      where: { tripId_userId: { tripId, userId } },
      create: {
        tripId,
        userId,
        travelStyleCompleted,
        moneyDnaCompleted,
        quizCompleted,
        travelStyleSource: patch.travelStyleSource ?? existing?.travelStyleSource ?? null,
        moneyDnaSource: patch.moneyDnaSource ?? null,
      },
      update: {
        travelStyleCompleted,
        moneyDnaCompleted,
        quizCompleted,
        ...(patch.travelStyleSource ? { travelStyleSource: patch.travelStyleSource } : {}),
        ...(patch.moneyDnaSource ? { moneyDnaSource: patch.moneyDnaSource } : {}),
      },
    });

    return quizCompleted;
  }

  private mapRow(row: {
    userId: string;
    experienceTendency: number;
    qualityTendency: number;
    timeValueTendency: number;
    socialScarcityTendency: number;
    budgetRangeMin: number | null;
    budgetRangeMax: number | null;
    consumptionPace: string;
    userNote: string | null;
    confidence: number;
    source: string;
    completedAt: Date;
  }): MoneyDnaCard {
    return {
      userId: row.userId,
      vector: {
        experienceTendency: row.experienceTendency,
        qualityTendency: row.qualityTendency,
        timeValueTendency: row.timeValueTendency,
        socialScarcityTendency: row.socialScarcityTendency,
      },
      budgetRangeMin: row.budgetRangeMin ?? undefined,
      budgetRangeMax: row.budgetRangeMax ?? undefined,
      consumptionPace: row.consumptionPace as MoneyDnaCard['consumptionPace'],
      userNote: row.userNote ?? undefined,
      confidence: row.confidence,
      completedAt: row.completedAt.toISOString(),
      source: (row.source ?? 'quiz') as MoneyDnaCard['source'],
    };
  }
}
