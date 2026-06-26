import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { MoneyDnaQuizService } from '../../decision-profiling/services/money-dna-quiz.service';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import type { MemberStateVector, MotionSignalInput } from '../types/group-pulse.types';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import {
  aggregateDecisionFatigue,
  calibratePhysicalFromMood,
  motionToPhysical,
  moodScoreToEmotional,
  spendingPaceToLevel,
} from '../utils/state-vector.util';
import { AnchorHandoffService } from './anchor-handoff.service';

type StateRow = {
  tripId: string;
  userId: string;
  dayNumber: number;
  physicalLevel: string;
  emotionalLevel: string;
  spendingLevel: string;
  socialLevel: string;
  decisionFatigue: string;
  confidenceScore: number;
  signals: unknown;
  computedAt: Date;
};

@Injectable()
export class MemberStateVectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly moneyDna: MoneyDnaQuizService,
  ) {}

  async getState(tripId: string, userId: string, dayNumber: number): Promise<MemberStateVector | null> {
    const row = await this.prisma.tripMemberRealtimeState.findUnique({
      where: { tripId_userId_dayNumber: { tripId, userId, dayNumber } },
    });
    return row ? this.toVector(row) : null;
  }

  async listStatesForDay(tripId: string, dayNumber: number): Promise<MemberStateVector[]> {
    const rows = await this.prisma.tripMemberRealtimeState.findMany({
      where: { tripId, dayNumber },
    });
    return rows.map((r) => this.toVector(r));
  }

  async recompute(
    tripId: string,
    userId: string,
    options?: {
      moodScore?: number;
      motion?: MotionSignalInput;
      dayNumber?: number;
    },
  ): Promise<MemberStateVector> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new Error(`trip ${tripId} not found`);

    const dayNumber =
      options?.dayNumber ??
      resolveTripDayNumber(trip.startDate, trip.endDate);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);

    const mood = await this.prisma.tripMoodCheck.findFirst({
      where: { tripId, userId, dayNumber },
      orderBy: { createdAt: 'desc' },
    });

    const moneyCard = await this.moneyDna.getMyCard(userId);
    const experienceTendency = moneyCard?.vector.experienceTendency ?? 0.5;

    const moodScore = options?.moodScore ?? mood?.score ?? 3;
    const emotional = moodScoreToEmotional(moodScore);
    let physical = calibratePhysicalFromMood(moodScore, experienceTendency);
    if (options?.motion) {
      physical = motionToPhysical(
        options.motion.steps,
        options.motion.restMinutes ?? 0,
      );
    }

    const spending = await this.computeSpendingLevel(tripId, userId, anchor);
    const social = await this.computeSocialLevel(tripId, userId, anchor);
    const decisionFatigue = await this.computeDecisionFatigue(tripId, userId, dayNumber);

    const confidenceScore = this.computeConfidence(mood, options?.motion);
    const signals = {
      moodScore,
      motion: options?.motion ?? null,
      spendingRatio: spending.ratio,
      decisionsToday: decisionFatigue.count,
    };

    const row = await this.prisma.tripMemberRealtimeState.upsert({
      where: { tripId_userId_dayNumber: { tripId, userId, dayNumber } },
      create: {
        tripId,
        userId,
        dayNumber,
        physicalLevel: physical,
        emotionalLevel: emotional,
        spendingLevel: spending.level,
        socialLevel: social,
        decisionFatigue: decisionFatigue.level,
        confidenceScore,
        signals: toInputJsonValue(signals),
        computedAt: new Date(),
      },
      update: {
        physicalLevel: physical,
        emotionalLevel: emotional,
        spendingLevel: spending.level,
        socialLevel: social,
        decisionFatigue: decisionFatigue.level,
        confidenceScore,
        signals: toInputJsonValue(signals),
        computedAt: new Date(),
      },
    });

    return this.toVector(row);
  }

  private async computeSpendingLevel(
    tripId: string,
    userId: string,
    anchor: InTripAnchorSnapshot | null,
  ): Promise<{ level: ReturnType<typeof spendingPaceToLevel>; ratio: number }> {
    const intentTotal = anchor?.budget.intent.total;
    if (!intentTotal || intentTotal <= 0) {
      return { level: 'normal', ratio: 1 };
    }
    const txs = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId, memberId: userId },
      select: { amountCny: true },
    });
    const spent = txs.reduce((s, t) => s + t.amountCny, 0);
    const ratio = spent / intentTotal;
    return { level: spendingPaceToLevel(ratio), ratio };
  }

  private async computeSocialLevel(
    tripId: string,
    userId: string,
    anchor: InTripAnchorSnapshot | null,
  ): Promise<'harmonious' | 'normal' | 'subtle' | 'tense'> {
    if (!anchor) return 'normal';
    const redPairs = anchor.team.highRiskAlerts.filter(
      (a) => a.memberAId === userId || a.memberBId === userId,
    );
    if (redPairs.length >= 2) return 'tense';
    if (redPairs.length === 1) return 'subtle';
    return 'harmonious';
  }

  private async computeDecisionFatigue(
    tripId: string,
    userId: string,
    dayNumber: number,
  ): Promise<{ level: ReturnType<typeof aggregateDecisionFatigue>; count: number }> {
    const start = DateTime.now().startOf('day').toJSDate();
    const [votes, envEvents] = await Promise.all([
      this.prisma.tripSilentVote.count({
        where: { tripId, createdAt: { gte: start } },
      }),
      this.prisma.tripEnvironmentEvent.count({
        where: { tripId, detectedAt: { gte: start } },
      }),
    ]);
    const count = votes + envEvents;
    return { level: aggregateDecisionFatigue(count), count };
  }

  private computeConfidence(
    mood: { score: number } | null,
    motion?: MotionSignalInput,
  ): number {
    let score = 0.5;
    if (mood) score += 0.25;
    if (motion) score += 0.25;
    return Math.min(1, score);
  }

  private toVector(row: StateRow): MemberStateVector {
    return {
      tripId: row.tripId,
      userId: row.userId,
      dayNumber: row.dayNumber,
      physicalLevel: row.physicalLevel as MemberStateVector['physicalLevel'],
      emotionalLevel: row.emotionalLevel as MemberStateVector['emotionalLevel'],
      spendingLevel: row.spendingLevel as MemberStateVector['spendingLevel'],
      socialLevel: row.socialLevel as MemberStateVector['socialLevel'],
      decisionFatigue: row.decisionFatigue as MemberStateVector['decisionFatigue'],
      confidenceScore: row.confidenceScore,
      signals: (row.signals as Record<string, unknown>) ?? {},
      computedAt: row.computedAt.toISOString(),
    };
  }
}
