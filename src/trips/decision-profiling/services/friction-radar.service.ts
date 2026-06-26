import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { FrictionRadarSnapshot } from '../types/decision-profiling.types';
import {
  buildHighRiskAlerts,
  computeFrictionMatrix,
} from '../utils/friction-matrix.util';
import { buildCompatibility } from '../utils/split-mechanism.util';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { DecisionProfilingAccessService } from './decision-profiling-access.service';
import { MoneyDnaQuizService } from './money-dna-quiz.service';
import { TravelStyleQuizService } from './travel-style-quiz.service';

@Injectable()
export class FrictionRadarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DecisionProfilingAccessService,
    private readonly travelStyle: TravelStyleQuizService,
    private readonly moneyDna: MoneyDnaQuizService,
  ) {}

  async getRadar(tripId: string, userId: string): Promise<FrictionRadarSnapshot> {
    await this.access.assertTripMember(tripId, userId);
    const memberIds = await this.access.listMemberIds(tripId);
    const names = await this.access.resolveDisplayNames(memberIds);

    const statuses = await this.prisma.tripDecisionProfilingStatus.findMany({
      where: { tripId, quizCompleted: true },
    });
    const completedCount = statuses.length;
    const memberCount = memberIds.length;
    const completionRate = memberCount > 0
      ? Math.round((completedCount / memberCount) * 100)
      : 0;

    const profiles = [];
    const moneyCards = [];
    for (const mid of memberIds) {
      const style = await this.travelStyle.getMyCard(mid);
      const money = await this.moneyDna.getMyCard(mid);
      if (!style || !money) continue;
      profiles.push({
        userId: mid,
        displayName: names.get(mid) ?? mid.slice(0, 8),
        style,
        money,
      });
      moneyCards.push(money);
    }

    const frictionMatrix = computeFrictionMatrix(profiles);
    const highRiskAlerts = buildHighRiskAlerts(frictionMatrix);
    const compatibility = buildCompatibility(moneyCards.length > 0 ? moneyCards : []);

    const snapshot: FrictionRadarSnapshot = {
      tripId,
      completionRate,
      completedCount,
      memberCount,
      frictionMatrix,
      highRiskAlerts,
      compatibility,
      computedAt: new Date().toISOString(),
    };

    await this.prisma.tripFrictionSnapshot.upsert({
      where: { tripId },
      create: {
        tripId,
        frictionMatrix: toInputJsonValue(snapshot.frictionMatrix),
        highRiskAlerts: toInputJsonValue(snapshot.highRiskAlerts),
        compatibility: toInputJsonValue(snapshot.compatibility),
        completionRate: snapshot.completionRate,
        computedAt: new Date(snapshot.computedAt),
      },
      update: {
        frictionMatrix: toInputJsonValue(snapshot.frictionMatrix),
        highRiskAlerts: toInputJsonValue(snapshot.highRiskAlerts),
        compatibility: toInputJsonValue(snapshot.compatibility),
        completionRate: snapshot.completionRate,
        computedAt: new Date(snapshot.computedAt),
      },
    });

    return snapshot;
  }
}
