import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type { InterventionCard } from '../types/group-pulse.types';
import type { RelationRiskHit } from './relation-risk.service';

type InterventionRow = {
  id: string;
  tripId: string;
  dayNumber: number;
  ruleId: string;
  level: number;
  messageZh: string;
  actions: unknown;
  status: string;
  splitSessionId: string | null;
  createdAt: Date;
};

@Injectable()
export class ProtectiveInterventionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async syncFromRisks(
    tripId: string,
    dayNumber: number,
    hits: RelationRiskHit[],
  ): Promise<number> {
    let created = 0;
    for (const hit of hits) {
      const exists = await this.prisma.tripProtectiveIntervention.findFirst({
        where: { tripId, dayNumber, ruleId: hit.ruleId, status: 'pending' },
      });
      if (exists) continue;

      const actions = this.actionsForRule(hit.ruleId);
      await this.prisma.tripProtectiveIntervention.create({
        data: {
          tripId,
          dayNumber,
          ruleId: hit.ruleId,
          level: hit.level,
          messageZh: hit.messageZh,
          actions: toInputJsonValue(actions),
          splitSessionId: hit.splitSessionId ?? null,
        },
      });

      await this.persistEvent(tripId, hit.ruleId, hit.level);
      created += 1;
    }
    return created;
  }

  async listPending(tripId: string): Promise<InterventionCard[]> {
    const rows = await this.prisma.tripProtectiveIntervention.findMany({
      where: { tripId, status: 'pending' },
      orderBy: [{ level: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => this.toCard(r));
  }

  async countPending(tripId: string): Promise<number> {
    return this.prisma.tripProtectiveIntervention.count({
      where: { tripId, status: 'pending' },
    });
  }

  async acknowledge(
    tripId: string,
    interventionId: string,
    userId: string,
    action: 'acknowledge' | 'dismiss',
  ): Promise<InterventionCard> {
    const row = await this.prisma.tripProtectiveIntervention.findFirst({
      where: { id: interventionId, tripId },
    });
    if (!row) {
      throw new NotFoundException(`干预 ${interventionId} 不存在`);
    }
    if (row.status !== 'pending') {
      throw new BadRequestException('该干预已处理');
    }

    const updated = await this.prisma.tripProtectiveIntervention.update({
      where: { id: interventionId },
      data: {
        status: action === 'acknowledge' ? 'acknowledged' : 'dismissed',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      },
    });
    return this.toCard(updated);
  }

  private actionsForRule(ruleId: string) {
    switch (ruleId) {
      case 'SPLIT_SIGNAL':
        return [
          { id: 'propose_split', label: '查看分组方案', actionType: 'split_propose' },
          { id: 'keep_together', label: '保持同行', actionType: 'dismiss' },
        ];
      case 'TEAM_ORANGE':
        return [
          { id: 'slow_pace', label: '降低今日强度', actionType: 'pace_reduce' },
          { id: 'private_chat', label: '私下沟通', actionType: 'private_channel' },
        ];
      default:
        return [
          { id: 'ack', label: '知道了', actionType: 'acknowledge' },
        ];
    }
  }

  private toCard(row: InterventionRow): InterventionCard {
    return {
      id: row.id,
      tripId: row.tripId,
      dayNumber: row.dayNumber,
      level: row.level as 1 | 2 | 3,
      ruleId: row.ruleId,
      framing: 'positive',
      messageZh: row.messageZh,
      actions: row.actions as InterventionCard['actions'],
      status: row.status as InterventionCard['status'],
      splitSessionId: row.splitSessionId,
      privateChannelAvailable: row.level >= 2,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async persistEvent(tripId: string, ruleId: string, level: number): Promise<void> {
    if (!this.travelEventPersistence) return;
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment: TrajectorySegment.ACTION,
        eventType: TravelEventType.TRIP_IN_TRIP_INTERVENTION_TRIGGERED,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        payload: { ruleId, level },
        idempotencyKey: `intervention:${tripId}:${ruleId}:${Date.now()}`,
        schemaVersion: 1,
      }),
    );
  }
}
