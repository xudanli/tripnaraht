import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DECISION_PROFILING_PROFILE_STALE_MONTHS,
  DECISION_PROFILING_QUIZ_VERSION,
} from '../config/quiz-version.config';
import type {
  MoneyDnaCard,
  OnboardingStatus,
  ReuseEligibility,
  ReuseProfileResult,
  SubmitQuizAnswer,
  TravelStyleCard,
} from '../types/decision-profiling.types';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import {
  buildMoneyDnaSummary,
  formatTripLabel,
  isProfileStale,
} from '../utils/profile-reuse.util';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';

interface StoredTravelStyleCard {
  styleType: TravelStyleCard['styleType'];
  styleLabel: string;
  coreDrivers: string[];
  teamRole: string;
  compatibilityHints: string[];
  userNote?: string | null;
  confidence: number;
  completedAt: string;
  source?: TravelStyleCard['source'];
}

interface StoredMoneyDnaCard {
  vector: MoneyDnaCard['vector'];
  budgetRangeMin?: number | null;
  budgetRangeMax?: number | null;
  consumptionPace: MoneyDnaCard['consumptionPace'];
  userNote?: string | null;
  confidence: number;
  completedAt: string;
  source?: MoneyDnaCard['source'];
}

@Injectable()
export class DecisionProfilingProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
  ) {}

  async upsertFromTravelStyleQuiz(
    userId: string,
    tripId: string,
    answers: SubmitQuizAnswer[],
    card: TravelStyleCard,
    quizCompletedOnTrip: boolean,
  ): Promise<void> {
    const tripLabel = await this.resolveTripLabel(tripId);
    const cardSnapshot = this.toTravelStyleCardSnapshot(card);

    await this.prisma.userDecisionProfilingProfile.upsert({
      where: { userId },
      create: {
        userId,
        travelStyleAnswers: toInputJsonValue(answers),
        travelStyleCard: toInputJsonValue(cardSnapshot),
        moneyDnaAnswers: toInputJsonValue([]),
        moneyDnaCard: toInputJsonValue({}),
        lastCompletedTripId: quizCompletedOnTrip ? tripId : null,
        lastCompletedAt: quizCompletedOnTrip ? new Date(card.completedAt) : null,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        lastCompletedTripLabel: quizCompletedOnTrip ? tripLabel : null,
      },
      update: {
        travelStyleAnswers: toInputJsonValue(answers),
        travelStyleCard: toInputJsonValue(cardSnapshot),
        ...(quizCompletedOnTrip
          ? {
              lastCompletedTripId: tripId,
              lastCompletedAt: new Date(card.completedAt),
              quizVersion: DECISION_PROFILING_QUIZ_VERSION,
              lastCompletedTripLabel: tripLabel,
            }
          : {}),
      },
    });
  }

  async upsertFromMoneyDnaQuiz(
    userId: string,
    tripId: string,
    answers: SubmitQuizAnswer[],
    card: MoneyDnaCard,
    quizCompletedOnTrip: boolean,
  ): Promise<void> {
    const tripLabel = await this.resolveTripLabel(tripId);
    const cardSnapshot = this.toMoneyDnaCardSnapshot(card);

    await this.prisma.userDecisionProfilingProfile.upsert({
      where: { userId },
      create: {
        userId,
        travelStyleAnswers: toInputJsonValue([]),
        travelStyleCard: toInputJsonValue({}),
        moneyDnaAnswers: toInputJsonValue(answers),
        moneyDnaCard: toInputJsonValue(cardSnapshot),
        lastCompletedTripId: quizCompletedOnTrip ? tripId : null,
        lastCompletedAt: quizCompletedOnTrip ? new Date(card.completedAt) : null,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        lastCompletedTripLabel: quizCompletedOnTrip ? tripLabel : null,
      },
      update: {
        moneyDnaAnswers: toInputJsonValue(answers),
        moneyDnaCard: toInputJsonValue(cardSnapshot),
        ...(quizCompletedOnTrip
          ? {
              lastCompletedTripId: tripId,
              lastCompletedAt: new Date(card.completedAt),
              quizVersion: DECISION_PROFILING_QUIZ_VERSION,
              lastCompletedTripLabel: tripLabel,
            }
          : {}),
      },
    });
  }

  async evaluateReuseEligibility(
    tripId: string,
    userId: string,
    status: Pick<
      OnboardingStatus,
      'travelStyleCompleted' | 'moneyDnaCompleted' | 'quizCompleted'
    >,
  ): Promise<ReuseEligibility | undefined> {
    if (status.quizCompleted) {
      return {
        eligible: false,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        profileQuizVersion: null,
        lastCompletedAt: null,
        lastCompletedTripLabel: null,
        preview: null,
        blockedReason: null,
      };
    }

    const profile = await this.prisma.userDecisionProfilingProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      const inferredOnly = await this.hasInferredOnlyCards(userId);
      return {
        eligible: false,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        profileQuizVersion: null,
        lastCompletedAt: null,
        lastCompletedTripLabel: null,
        preview: null,
        blockedReason: inferredOnly ? 'inferred_only' : 'no_profile',
      };
    }

    if (profile.quizVersion !== DECISION_PROFILING_QUIZ_VERSION) {
      return {
        eligible: false,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        profileQuizVersion: profile.quizVersion,
        lastCompletedAt: profile.lastCompletedAt?.toISOString() ?? null,
        lastCompletedTripLabel: await this.resolveProfileTripLabel(profile),
        preview: this.buildPreview(profile),
        blockedReason: 'quiz_version_mismatch',
      };
    }

    if (
      !profile.lastCompletedAt
      || isProfileStale(profile.lastCompletedAt, DECISION_PROFILING_PROFILE_STALE_MONTHS)
    ) {
      return {
        eligible: false,
        quizVersion: DECISION_PROFILING_QUIZ_VERSION,
        profileQuizVersion: profile.quizVersion,
        lastCompletedAt: profile.lastCompletedAt?.toISOString() ?? null,
        lastCompletedTripLabel: await this.resolveProfileTripLabel(profile),
        preview: this.buildPreview(profile),
        blockedReason: 'profile_stale',
      };
    }

    return {
      eligible: true,
      quizVersion: DECISION_PROFILING_QUIZ_VERSION,
      profileQuizVersion: profile.quizVersion,
      lastCompletedAt: profile.lastCompletedAt.toISOString(),
      lastCompletedTripLabel: await this.resolveProfileTripLabel(profile),
      preview: this.buildPreview(profile),
      blockedReason: null,
    };
  }

  async reuseProfile(
    tripId: string,
    userId: string,
    userNote?: string,
  ): Promise<ReuseProfileResult> {
    await this.access.assertTripMember(tripId, userId);

    const statusRow = await this.prisma.tripDecisionProfilingStatus.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (statusRow?.quizCompleted) {
      throw new BadRequestException({
        code: 'SECTION_ALREADY_COMPLETED',
        message: '本行程决策画像已完成，无法沿用',
      });
    }

    const reuse = await this.evaluateReuseEligibility(tripId, userId, {
      travelStyleCompleted: statusRow?.travelStyleCompleted ?? false,
      moneyDnaCompleted: statusRow?.moneyDnaCompleted ?? false,
      quizCompleted: statusRow?.quizCompleted ?? false,
    });

    if (!reuse?.eligible) {
      throw new BadRequestException({
        code: 'REUSE_NOT_ELIGIBLE',
        message: '当前不满足决策画像沿用条件',
      });
    }

    const profile = await this.prisma.userDecisionProfilingProfile.findUniqueOrThrow({
      where: { userId },
    });

    const travelStyleCardStored = profile.travelStyleCard as unknown as StoredTravelStyleCard;
    const moneyDnaCardStored = profile.moneyDnaCard as unknown as StoredMoneyDnaCard;
    const travelStyleAnswers = profile.travelStyleAnswers as unknown as SubmitQuizAnswer[];
    const moneyDnaAnswers = profile.moneyDnaAnswers as unknown as SubmitQuizAnswer[];
    const now = new Date();
    const travelStyleSource = userNote?.trim() ? 'reused_edited' : 'reused';

    const travelStyleCard: TravelStyleCard = {
      userId,
      styleType: travelStyleCardStored.styleType,
      styleLabel: travelStyleCardStored.styleLabel,
      coreDrivers: travelStyleCardStored.coreDrivers,
      teamRole: travelStyleCardStored.teamRole,
      compatibilityHints: travelStyleCardStored.compatibilityHints,
      userNote: userNote?.trim() || travelStyleCardStored.userNote || undefined,
      confidence: travelStyleCardStored.confidence,
      completedAt: now.toISOString(),
      source: travelStyleSource,
    };

    const moneyDnaCard: MoneyDnaCard = {
      userId,
      vector: moneyDnaCardStored.vector,
      budgetRangeMin: moneyDnaCardStored.budgetRangeMin ?? undefined,
      budgetRangeMax: moneyDnaCardStored.budgetRangeMax ?? undefined,
      consumptionPace: moneyDnaCardStored.consumptionPace,
      userNote: moneyDnaCardStored.userNote ?? undefined,
      confidence: moneyDnaCardStored.confidence,
      completedAt: now.toISOString(),
      source: 'reused',
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.userTravelStyleCard.upsert({
        where: { userId },
        create: {
          userId,
          styleType: travelStyleCard.styleType,
          styleLabel: travelStyleCard.styleLabel,
          coreDrivers: toInputJsonValue(travelStyleCard.coreDrivers),
          teamRole: travelStyleCard.teamRole,
          compatibilityHints: toInputJsonValue(travelStyleCard.compatibilityHints),
          userNote: travelStyleCard.userNote ?? null,
          quizAnswers: toInputJsonValue(travelStyleAnswers),
          styleScores: toInputJsonValue({}),
          confidence: travelStyleCard.confidence,
          source: travelStyleCard.source,
          completedAt: now,
        },
        update: {
          styleType: travelStyleCard.styleType,
          styleLabel: travelStyleCard.styleLabel,
          coreDrivers: toInputJsonValue(travelStyleCard.coreDrivers),
          teamRole: travelStyleCard.teamRole,
          compatibilityHints: toInputJsonValue(travelStyleCard.compatibilityHints),
          userNote: travelStyleCard.userNote ?? null,
          quizAnswers: toInputJsonValue(travelStyleAnswers),
          confidence: travelStyleCard.confidence,
          source: travelStyleCard.source,
          completedAt: now,
        },
      });

      await tx.userMoneyDnaQuiz.upsert({
        where: { userId },
        create: {
          userId,
          experienceTendency: moneyDnaCard.vector.experienceTendency,
          qualityTendency: moneyDnaCard.vector.qualityTendency,
          timeValueTendency: moneyDnaCard.vector.timeValueTendency,
          socialScarcityTendency: moneyDnaCard.vector.socialScarcityTendency,
          budgetRangeMin: moneyDnaCard.budgetRangeMin ?? null,
          budgetRangeMax: moneyDnaCard.budgetRangeMax ?? null,
          consumptionPace: moneyDnaCard.consumptionPace,
          userNote: moneyDnaCard.userNote ?? null,
          quizAnswers: toInputJsonValue(moneyDnaAnswers),
          confidence: moneyDnaCard.confidence,
          source: 'reused',
          completedAt: now,
        },
        update: {
          experienceTendency: moneyDnaCard.vector.experienceTendency,
          qualityTendency: moneyDnaCard.vector.qualityTendency,
          timeValueTendency: moneyDnaCard.vector.timeValueTendency,
          socialScarcityTendency: moneyDnaCard.vector.socialScarcityTendency,
          budgetRangeMin: moneyDnaCard.budgetRangeMin ?? null,
          budgetRangeMax: moneyDnaCard.budgetRangeMax ?? null,
          consumptionPace: moneyDnaCard.consumptionPace,
          userNote: moneyDnaCard.userNote ?? null,
          quizAnswers: toInputJsonValue(moneyDnaAnswers),
          confidence: moneyDnaCard.confidence,
          source: 'reused',
          completedAt: now,
        },
      });

      await tx.tripDecisionProfilingStatus.upsert({
        where: { tripId_userId: { tripId, userId } },
        create: {
          tripId,
          userId,
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
          travelStyleSource: travelStyleSource,
          moneyDnaSource: 'reused',
          reusedFromTripId: profile.lastCompletedTripId,
          reusedAt: now,
        },
        update: {
          travelStyleCompleted: true,
          moneyDnaCompleted: true,
          quizCompleted: true,
          travelStyleSource: travelStyleSource,
          moneyDnaSource: 'reused',
          reusedFromTripId: profile.lastCompletedTripId,
          reusedAt: now,
        },
      });
    });

    const onboarding = await this.buildOnboardingStatus(tripId, userId);
    return { onboarding, travelStyle: travelStyleCard, moneyDna: moneyDnaCard };
  }

  async buildOnboardingStatus(tripId: string, userId: string): Promise<OnboardingStatus> {
    const memberIds = await this.access.listMemberIds(tripId);
    const row = await this.prisma.tripDecisionProfilingStatus.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    const completedRows = await this.prisma.tripDecisionProfilingStatus.count({
      where: { tripId, quizCompleted: true },
    });

    const base: OnboardingStatus = {
      tripId,
      userId,
      travelStyleCompleted: row?.travelStyleCompleted ?? false,
      moneyDnaCompleted: row?.moneyDnaCompleted ?? false,
      quizCompleted: row?.quizCompleted ?? false,
      teamCompletionRate: memberIds.length > 0
        ? Math.round((completedRows / memberIds.length) * 100)
        : 0,
    };

    const reuse = await this.evaluateReuseEligibility(tripId, userId, base);
    if (reuse) {
      base.reuse = reuse;
    }
    return base;
  }

  private async hasInferredOnlyCards(userId: string): Promise<boolean> {
    const [travelStyle, moneyDna] = await Promise.all([
      this.prisma.userTravelStyleCard.findUnique({ where: { userId } }),
      this.prisma.userMoneyDnaQuiz.findUnique({ where: { userId } }),
    ]);

    const travelInferred = travelStyle?.source === 'inferred';
    const moneyInferred = moneyDna?.source === 'inferred';
    return travelInferred || moneyInferred;
  }

  private buildPreview(profile: {
    travelStyleCard: unknown;
    moneyDnaCard: unknown;
  }): ReuseEligibility['preview'] {
    const travelStyleCard = profile.travelStyleCard as unknown as StoredTravelStyleCard;
    const moneyDnaCard = profile.moneyDnaCard as unknown as StoredMoneyDnaCard;
    if (!travelStyleCard?.styleLabel || !moneyDnaCard?.vector) return null;

    return {
      travelStyleLabel: travelStyleCard.styleLabel,
      moneyDnaSummary: buildMoneyDnaSummary({
        vector: moneyDnaCard.vector,
        consumptionPace: moneyDnaCard.consumptionPace,
      }),
      confidence: {
        travelStyle: travelStyleCard.confidence,
        moneyDna: moneyDnaCard.confidence,
      },
    };
  }

  private async resolveTripLabel(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { name: true, destination: true, startDate: true },
    });
    if (!trip) return '上次行程';
    return formatTripLabel(trip);
  }

  private async resolveProfileTripLabel(profile: {
    lastCompletedTripId: string | null;
    lastCompletedTripLabel: string | null;
  }): Promise<string | null> {
    if (profile.lastCompletedTripLabel) return profile.lastCompletedTripLabel;
    if (!profile.lastCompletedTripId) return null;

    const trip = await this.prisma.trip.findUnique({
      where: { id: profile.lastCompletedTripId },
      select: { name: true, destination: true, startDate: true },
    });
    return trip ? formatTripLabel(trip) : '上次行程';
  }

  private toTravelStyleCardSnapshot(card: TravelStyleCard): StoredTravelStyleCard {
    return {
      styleType: card.styleType,
      styleLabel: card.styleLabel,
      coreDrivers: card.coreDrivers,
      teamRole: card.teamRole,
      compatibilityHints: card.compatibilityHints,
      userNote: card.userNote ?? null,
      confidence: card.confidence,
      completedAt: card.completedAt,
      source: card.source,
    };
  }

  private toMoneyDnaCardSnapshot(card: MoneyDnaCard): StoredMoneyDnaCard {
    return {
      vector: card.vector,
      budgetRangeMin: card.budgetRangeMin ?? null,
      budgetRangeMax: card.budgetRangeMax ?? null,
      consumptionPace: card.consumptionPace,
      userNote: card.userNote ?? null,
      confidence: card.confidence,
      completedAt: card.completedAt,
      source: card.source ?? 'quiz',
    };
  }
}
