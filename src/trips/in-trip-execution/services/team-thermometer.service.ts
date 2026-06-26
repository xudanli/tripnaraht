import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import type { MemberStateVector } from '../types/group-pulse.types';
import { levelToNumeric, scoreToThermometerLevel } from '../utils/state-vector.util';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { MemberStateVectorService } from './member-state-vector.service';

@Injectable()
export class TeamThermometerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly stateVector: MemberStateVectorService,
  ) {}

  async computeAndPersist(tripId: string, dayNumber: number): Promise<{
    level: ReturnType<typeof scoreToThermometerLevel>;
    score: number;
  }> {
    const states = await this.stateVector.listStatesForDay(tripId, dayNumber);
    if (states.length === 0) {
      return { level: 'green', score: 0.8 };
    }

    const scores = states.map((s) => this.memberScore(s));
    const score = scores.reduce((a, b) => a + b, 0) / scores.length;
    const level = scoreToThermometerLevel(score);

    const factors = [
      {
        key: 'emotional',
        message: `团队情绪均值 ${Math.round(score * 100)}%`,
        weight: 0.4,
      },
      {
        key: 'member_count',
        message: `${states.length} 名成员已上报状态`,
        weight: 0.2,
      },
    ];

    await this.prisma.tripTeamThermometerSnapshot.upsert({
      where: { tripId_dayNumber: { tripId, dayNumber } },
      create: {
        tripId,
        dayNumber,
        level,
        score,
        factors: toInputJsonValue(factors),
        computedAt: new Date(),
      },
      update: {
        level,
        score,
        factors: toInputJsonValue(factors),
        computedAt: new Date(),
      },
    });

    return { level, score };
  }

  async getSnapshot(
    tripId: string,
    userId: string,
    isOrganizer: boolean,
  ): Promise<{
    tripId: string;
    dayNumber: number;
    level: string;
    score: number;
    factors: unknown[];
    memberCards: Array<{ userId: string; displayName: string; level: string }>;
    visible: boolean;
    computedAt: string | null;
  }> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new BadRequestException(`行程 ${tripId} 不存在`);

    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const row = await this.prisma.tripTeamThermometerSnapshot.findUnique({
      where: { tripId_dayNumber: { tripId, dayNumber } },
    });

    const states = await this.stateVector.listStatesForDay(tripId, dayNumber);
    const nameMap = this.memberNameMap(anchor);

    const memberCards = states.map((s) => ({
      userId: s.userId,
      displayName: nameMap.get(s.userId) ?? s.userId.slice(0, 8),
      level: scoreToThermometerLevel(this.memberScore(s)),
    }));

    return {
      tripId,
      dayNumber,
      level: row?.level ?? 'green',
      score: row?.score ?? 0.8,
      factors: (row?.factors as unknown[]) ?? [],
      memberCards,
      visible: isOrganizer,
      computedAt: row?.computedAt.toISOString() ?? null,
    };
  }

  private memberScore(state: MemberStateVector): number {
    const vals = [
      levelToNumeric(state.physicalLevel),
      levelToNumeric(state.emotionalLevel),
      levelToNumeric(state.spendingLevel),
      levelToNumeric(state.socialLevel),
      levelToNumeric(state.decisionFatigue),
    ];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  private memberNameMap(anchor: InTripAnchorSnapshot | null): Map<string, string> {
    const map = new Map<string, string>();
    for (const m of anchor?.team.members ?? []) {
      map.set(m.userId, m.displayName);
    }
    return map;
  }
}
