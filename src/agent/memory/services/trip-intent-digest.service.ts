import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripDomainInfluenceService } from '../../../trips/domain-influence/services/trip-domain-influence.service';
import type { MoneyDnaCard } from '../../../trips/decision-profiling/types/decision-profiling.types';
import { extractGuardianNegotiationSnapshot } from '../../../trips/readiness/utils/readiness-guardian-negotiation.util';
import type {
  DecisionProfilingDigestV1,
  DomainInfluenceDigestV1,
  NegotiationDigestV1,
  PrivateWishDigestV1,
  WishConstraintDigestV1,
} from '../interfaces/trip-intent-digest.types';
import {
  buildDecisionProfilingDigest,
  buildDomainInfluenceDigestFromSnapshot,
  buildNegotiationDigest,
  buildPrivateWishDigest,
  buildWishConstraintDigest,
} from '../utils/trip-intent-digest.util';

export type TripIntentDigestBundle = {
  domainInfluenceDigest: DomainInfluenceDigestV1 | null;
  wishConstraintDigest: WishConstraintDigestV1 | null;
  privateWishDigest: PrivateWishDigestV1 | null;
  decisionProfilingDigest: DecisionProfilingDigestV1 | null;
  negotiationDigest: NegotiationDigestV1 | null;
};

/**
 * Loads replay-safe trip intent digests for AgentMemoryContext (not L1–L4 persistence).
 */
@Injectable()
export class TripIntentDigestService {
  private readonly logger = new Logger(TripIntentDigestService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly tripDomainInfluence?: TripDomainInfluenceService,
  ) {}

  async loadForMemoryContext(
    tripId: string,
    userId: string | null,
  ): Promise<TripIntentDigestBundle> {
    const empty: TripIntentDigestBundle = {
      domainInfluenceDigest: null,
      wishConstraintDigest: null,
      privateWishDigest: null,
      decisionProfilingDigest: null,
      negotiationDigest: null,
    };

    const tid = tripId?.trim();
    if (!tid) {
      return empty;
    }

    let domainInfluenceDigest: DomainInfluenceDigestV1 | null = null;
    let negotiationDigest: NegotiationDigestV1 | null = null;
    if (userId && userId !== 'anonymous' && this.tripDomainInfluence) {
      try {
        const snapshot = await this.tripDomainInfluence.getSnapshot(tid, userId);
        domainInfluenceDigest = buildDomainInfluenceDigestFromSnapshot(snapshot);

        const { tasks } = await this.tripDomainInfluence.listCollaborativeTasks(tid, userId);
        const split = await this.loadSplitConsensus(tid);
        const guardianSnapshot = await this.loadGuardianSnapshot(tid);
        negotiationDigest = buildNegotiationDigest({
          collaborativeTasks: tasks,
          guardianSnapshot,
          splitMechanismLocked: split?.locked ?? false,
          splitMechanismMode: split?.mode ?? null,
        });
      } catch (e: unknown) {
        this.logger.warn(
          `TripIntentDigest: domain/negotiation digest skipped trip=${tid}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    let wishConstraintDigest: WishConstraintDigestV1 | null = null;
    let privateWishDigest: PrivateWishDigestV1 | null = null;
    if (this.prisma) {
      try {
        const rows = await this.prisma.tripWishItem.findMany({
          where: { tripId: tid, status: 'active' },
          select: {
            userId: true,
            visibility: true,
            agentEligible: true,
            structuredHints: true,
            category: true,
            importance: true,
            text: true,
          },
        });
        wishConstraintDigest = buildWishConstraintDigest(rows, userId);
        privateWishDigest = buildPrivateWishDigest(rows, userId);
      } catch (e: unknown) {
        this.logger.warn(
          `TripIntentDigest: wish digest skipped trip=${tid}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    let decisionProfilingDigest: DecisionProfilingDigestV1 | null = null;
    if (userId && userId !== 'anonymous' && this.prisma) {
      try {
        decisionProfilingDigest = await this.loadDecisionProfilingDigest(tid, userId);
      } catch (e: unknown) {
        this.logger.warn(
          `TripIntentDigest: decision profiling digest skipped trip=${tid}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return {
      domainInfluenceDigest,
      wishConstraintDigest,
      privateWishDigest,
      decisionProfilingDigest,
      negotiationDigest,
    };
  }

  private async loadDecisionProfilingDigest(
    tripId: string,
    userId: string,
  ): Promise<DecisionProfilingDigestV1 | null> {
    if (!this.prisma) return null;

    const [statuses, userStatus, userStyle, userMoney, friction, split] = await Promise.all([
      this.prisma.tripDecisionProfilingStatus.findMany({ where: { tripId } }),
      this.prisma.tripDecisionProfilingStatus.findUnique({
        where: { tripId_userId: { tripId, userId } },
      }),
      this.prisma.userTravelStyleCard.findUnique({ where: { userId } }),
      this.prisma.userMoneyDnaQuiz.findUnique({ where: { userId } }),
      this.prisma.tripFrictionSnapshot.findUnique({ where: { tripId } }),
      this.loadSplitConsensus(tripId),
    ]);

    const memberCount = statuses.length || 1;
    const completed = statuses.filter((s) => s.quizCompleted).length;
    const teamCompletionRate =
      memberCount > 0 ? Math.round((completed / memberCount) * 100) : 0;

    const teamStyleLabels: string[] = [];
    for (const s of statuses) {
      if (!s.quizCompleted) continue;
      const card = await this.prisma.userTravelStyleCard.findUnique({
        where: { userId: s.userId },
        select: { styleLabel: true },
      });
      if (card?.styleLabel) teamStyleLabels.push(card.styleLabel);
    }

    const highRiskFrictionDomains: string[] = [];
    if (friction?.highRiskAlerts) {
      const alerts = friction.highRiskAlerts as Array<{ domain?: string; message?: string }>;
      for (const alert of alerts) {
        const label = alert.domain ?? alert.message;
        if (label?.trim()) highRiskFrictionDomains.push(label.trim());
      }
    }

    return buildDecisionProfilingDigest({
      teamCompletionRate,
      requestingUserQuizCompleted: userStatus?.quizCompleted ?? false,
      requestingUserStyle: userStyle
        ? { styleLabel: userStyle.styleLabel, teamRole: userStyle.teamRole }
        : null,
      requestingUserMoney: userMoney
        ? {
            vector: {
              experienceTendency: userMoney.experienceTendency,
              qualityTendency: userMoney.qualityTendency,
              timeValueTendency: userMoney.timeValueTendency,
              socialScarcityTendency: userMoney.socialScarcityTendency,
            },
            consumptionPace: userMoney.consumptionPace as MoneyDnaCard['consumptionPace'],
          }
        : null,
      teamStyleLabels,
      highRiskFrictionDomains,
      splitMechanismLocked: split?.locked ?? false,
      splitMechanismMode: split?.mode ?? null,
    });
  }

  private async loadSplitConsensus(
    tripId: string,
  ): Promise<{ mode: string | null; locked: boolean } | null> {
    if (!this.prisma) return null;
    const row = await this.prisma.tripSplitMechanismConsensus.findUnique({
      where: { tripId },
      select: { selectedMode: true, lockedAt: true, lockedMode: true },
    });
    if (!row) return null;
    return {
      mode: row.lockedMode ?? row.selectedMode ?? null,
      locked: row.lockedAt != null,
    };
  }

  private async loadGuardianSnapshot(tripId: string) {
    if (!this.prisma) return undefined;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return trip ? extractGuardianNegotiationSnapshot(trip.metadata) : undefined;
  }
}
