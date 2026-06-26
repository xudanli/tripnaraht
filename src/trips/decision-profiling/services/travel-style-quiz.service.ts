import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TRAVEL_STYLE_QUIZ_QUESTIONS } from '../config/travel-style-quiz.config';
import type {
  SubmitQuizPayload,
  TravelStyleCard,
  TravelStyleCardTeamView,
} from '../types/decision-profiling.types';
import { buildTravelStyleCard, toTeamStyleView } from '../utils/decision-style-scorer.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { DecisionProfilingProfileService } from './decision-profiling-profile.service';

@Injectable()
export class TravelStyleQuizService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
    private readonly profile: DecisionProfilingProfileService,
  ) {}

  getQuestions() {
    return TRAVEL_STYLE_QUIZ_QUESTIONS;
  }

  async getMyCard(userId: string): Promise<TravelStyleCard | null> {
    const row = await this.prisma.userTravelStyleCard.findUnique({ where: { userId } });
    if (!row) return null;
    if (row.source === 'inferred') {
      return { ...this.mapRow(row), source: 'inferred' };
    }
    return this.mapRow(row);
  }

  async submitQuiz(userId: string, tripId: string, payload: SubmitQuizPayload): Promise<TravelStyleCard> {
    await this.access.assertTripMember(tripId, userId);
    const card = buildTravelStyleCard(userId, payload.answers, payload.userNote);
    const scores = payload.answers;

    await this.prisma.userTravelStyleCard.upsert({
      where: { userId },
      create: {
        userId,
        styleType: card.styleType,
        styleLabel: card.styleLabel,
        coreDrivers: toInputJsonValue(card.coreDrivers),
        teamRole: card.teamRole,
        compatibilityHints: toInputJsonValue(card.compatibilityHints),
        userNote: card.userNote ?? null,
        quizAnswers: toInputJsonValue(scores),
        styleScores: toInputJsonValue({}),
        confidence: card.confidence,
        source: card.source,
        completedAt: new Date(card.completedAt),
      },
      update: {
        styleType: card.styleType,
        styleLabel: card.styleLabel,
        coreDrivers: toInputJsonValue(card.coreDrivers),
        teamRole: card.teamRole,
        compatibilityHints: toInputJsonValue(card.compatibilityHints),
        userNote: card.userNote ?? null,
        quizAnswers: toInputJsonValue(scores),
        confidence: card.confidence,
        source: card.source,
        completedAt: new Date(card.completedAt),
      },
    });

    const quizCompletedOnTrip = await this.upsertTripStatus(tripId, userId, {
      travelStyleCompleted: true,
      travelStyleSource: card.source,
    });

    await this.profile.upsertFromTravelStyleQuiz(
      userId,
      tripId,
      payload.answers,
      card,
      quizCompletedOnTrip,
    );

    return card;
  }

  async patchCard(userId: string, userNote: string): Promise<TravelStyleCard> {
    const existing = await this.prisma.userTravelStyleCard.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('请先完成 Travel Style 调查');

    const nextSource =
      existing.source === 'reused'
        ? 'reused_edited'
        : existing.source === 'reused_edited'
          ? 'reused_edited'
          : 'quiz_edited';

    const row = await this.prisma.userTravelStyleCard.update({
      where: { userId },
      data: { userNote, source: nextSource },
    });
    return this.mapRow(row);
  }

  async getTeamCards(tripId: string, viewerId: string): Promise<TravelStyleCardTeamView[]> {
    await this.access.assertTripMember(tripId, viewerId);
    const memberIds = await this.access.listMemberIds(tripId);
    const names = await this.access.resolveDisplayNames(memberIds);
    const rows = await this.prisma.userTravelStyleCard.findMany({
      where: { userId: { in: memberIds } },
    });
    return rows.map((row) => {
      const card = this.mapRow(row);
      return toTeamStyleView(card, names.get(card.userId) ?? card.userId.slice(0, 8));
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
        travelStyleSource: patch.travelStyleSource ?? null,
        moneyDnaSource: patch.moneyDnaSource ?? existing?.moneyDnaSource ?? null,
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
    styleType: string;
    styleLabel: string;
    coreDrivers: unknown;
    teamRole: string;
    compatibilityHints: unknown;
    userNote: string | null;
    confidence: number;
    source: string;
    completedAt: Date;
  }): TravelStyleCard {
    return {
      userId: row.userId,
      styleType: row.styleType as TravelStyleCard['styleType'],
      styleLabel: row.styleLabel,
      coreDrivers: row.coreDrivers as string[],
      teamRole: row.teamRole,
      compatibilityHints: row.compatibilityHints as string[],
      userNote: row.userNote ?? undefined,
      confidence: row.confidence,
      completedAt: row.completedAt.toISOString(),
      source: row.source as TravelStyleCard['source'],
    };
  }
}
