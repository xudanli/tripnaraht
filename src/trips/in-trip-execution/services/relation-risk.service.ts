import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { InTripAnchorSnapshot } from '../types/anchor-handoff.types';
import { MemberStateVectorService } from './member-state-vector.service';

export interface RelationRiskHit {
  ruleId: string;
  level: 1 | 2 | 3;
  messageZh: string;
  splitSessionId?: string;
}

@Injectable()
export class RelationRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateVector: MemberStateVectorService,
  ) {}

  async evaluate(
    tripId: string,
    dayNumber: number,
    anchor: InTripAnchorSnapshot | null,
  ): Promise<RelationRiskHit[]> {
    const hits: RelationRiskHit[] = [];
    const states = await this.stateVector.listStatesForDay(tripId, dayNumber);

    for (const state of states) {
      if (state.physicalLevel === 'fatigued' || state.physicalLevel === 'exhausted') {
        hits.push({
          ruleId: 'SINGLE_FATIGUE',
          level: 1,
          messageZh: '有成员体力偏低，建议降低今日强度或安排缓冲',
        });
        break;
      }
    }

    if (anchor) {
      const redAlerts = anchor.team.highRiskAlerts;
      if (redAlerts.length > 0) {
        hits.push({
          ruleId: 'FRICTION_PAIR_COLD',
          level: 2,
          messageZh: '行前预警的高摩擦组合仍在行中，建议错开高强度共同决策',
        });
      }
    }

    const thermo = await this.prisma.tripTeamThermometerSnapshot.findUnique({
      where: { tripId_dayNumber: { tripId, dayNumber } },
    });
    if (thermo && (thermo.level === 'orange' || thermo.level === 'red')) {
      hits.push({
        ruleId: 'TEAM_ORANGE',
        level: 2,
        messageZh: '团队温度计偏高，建议放慢节奏并增加共识环节',
      });
    }

    const splitSignals = states.filter(
      (s) => s.signals.splitPartySignal === true,
    );
    if (splitSignals.length >= 2) {
      hits.push({
        ruleId: 'SPLIT_SIGNAL',
        level: 3,
        messageZh: '多名成员表达了分组探索意愿，可生成分组活动方案',
      });
    }

    return this.dedupeByRule(hits);
  }

  private dedupeByRule(hits: RelationRiskHit[]): RelationRiskHit[] {
    const seen = new Set<string>();
    return hits.filter((h) => {
      if (seen.has(h.ruleId)) return false;
      seen.add(h.ruleId);
      return true;
    });
  }
}
