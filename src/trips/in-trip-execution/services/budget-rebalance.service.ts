import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TripBudgetProfileService } from '../../budget-os/services/trip-budget-profile.service';
import type { CategoryAllocations } from '../../budget-os/types/trip-budget-os.types';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type {
  PsychologicalBucket,
  RebalanceProposal,
  RebalanceResponse,
  RebalanceScenario,
  RebalanceSuggestionSummary,
} from '../types/money-brain.types';
import {
  PSYCHOLOGICAL_BUCKETS,
  assignBucket,
  bucketLabel,
  structureKeyToBucket,
} from '../utils/bucket-assignment.util';
import { InTripAccessService } from './in-trip-access.service';

const CONTINGENCY_RESERVE_RATIO = 0.1;
const SURPLUS_THRESHOLD = 0.8;
const OVERSPEND_THRESHOLD = 1.15;
const PACE_GAP_THRESHOLD = 0.25;

type SuggestionRow = {
  id: string;
  tripId: string;
  scenario: string;
  message: string;
  proposal: unknown;
  status: string;
  createdAt: Date;
};

@Injectable()
export class BudgetRebalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly budgetProfile: TripBudgetProfileService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async listPending(tripId: string, userId: string): Promise<RebalanceSuggestionSummary[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const rows = await this.prisma.tripBudgetRebalanceSuggestion.findMany({
      where: { tripId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  async countPending(tripId: string): Promise<number> {
    return this.prisma.tripBudgetRebalanceSuggestion.count({
      where: { tripId, status: 'pending' },
    });
  }

  async respond(
    tripId: string,
    suggestionId: string,
    userId: string,
    response: RebalanceResponse,
  ): Promise<RebalanceSuggestionSummary> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertOrganizer(tripId, userId);

    const row = await this.prisma.tripBudgetRebalanceSuggestion.findFirst({
      where: { id: suggestionId, tripId },
    });
    if (!row) {
      throw new NotFoundException(`再平衡建议 ${suggestionId} 不存在`);
    }
    if (row.status !== 'pending') {
      throw new BadRequestException('该建议已处理');
    }

    const updated = await this.prisma.tripBudgetRebalanceSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: response === 'accept' ? 'accepted' : 'dismissed',
        userResponse: response,
        respondedBy: userId,
        respondedAt: new Date(),
      },
    });
    return this.toSummary(updated);
  }

  async scan(tripId: string, userId?: string): Promise<number> {
    if (userId) {
      await this.access.assertInTripPhase(tripId);
      await this.access.assertTripMember(tripId, userId);
    }

    const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
    const structure = profile.structure;
    if (!structure?.allocations) return 0;

    const bucketActuals = await this.aggregateBucketActuals(tripId);
    let created = 0;

    for (const bucket of PSYCHOLOGICAL_BUCKETS) {
      if (bucket === 'contingency') continue;
      const planned = this.plannedForBucket(bucket, structure.allocations, profile.intent?.total);
      const actual = bucketActuals[bucket] ?? 0;
      if (planned <= 0) continue;

      const ratio = actual / planned;
      if (ratio < SURPLUS_THRESHOLD) {
        created += await this.upsertSuggestion(tripId, 'surplus', bucket, planned, actual, ratio);
      } else if (ratio > OVERSPEND_THRESHOLD) {
        created += await this.upsertSuggestion(tripId, 'overspend', bucket, planned, actual, ratio);
      }
    }

    created += await this.scanPaceGap(tripId, profile.intent?.total);
    return created;
  }

  private plannedForBucket(
    bucket: PsychologicalBucket,
    allocations: CategoryAllocations,
    intentTotal?: number,
  ): number {
    if (bucket === 'contingency') {
      return intentTotal ? Math.round(intentTotal * CONTINGENCY_RESERVE_RATIO) : 0;
    }
    const key = (bucket === 'experience' ? 'experience' : bucket) as keyof CategoryAllocations;
    return allocations[key] ?? 0;
  }

  private async aggregateBucketActuals(
    tripId: string,
  ): Promise<Partial<Record<PsychologicalBucket, number>>> {
    const txs = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId },
      select: { bucketAssignment: true, amountCny: true },
    });
    const out: Partial<Record<PsychologicalBucket, number>> = {};
    for (const tx of txs) {
      const bucket = tx.bucketAssignment as PsychologicalBucket;
      out[bucket] = (out[bucket] ?? 0) + tx.amountCny;
    }

    const profile = await this.budgetProfile.getProfile(tripId, ['actuals']);
    const vsActual = profile.structure?.structureVsActual;
    if (vsActual) {
      for (const [key, entry] of Object.entries(vsActual)) {
        const bucket = structureKeyToBucket(key);
        if (bucket && entry.actual > 0) {
          out[bucket] = Math.max(out[bucket] ?? 0, entry.actual);
        }
      }
    }
    return out;
  }

  private async scanPaceGap(tripId: string, intentTotal?: number): Promise<number> {
    if (!intentTotal || intentTotal <= 0) return 0;

    const txs = await this.prisma.tripSmartTransaction.findMany({
      where: { tripId },
      select: { memberId: true, amountCny: true },
    });
    if (txs.length < 2) return 0;

    const byMember = new Map<string, number>();
    for (const tx of txs) {
      byMember.set(tx.memberId, (byMember.get(tx.memberId) ?? 0) + tx.amountCny);
    }

    const progresses = [...byMember.values()].map((s) => s / intentTotal);
    const max = Math.max(...progresses);
    const min = Math.min(...progresses);
    if (max - min <= PACE_GAP_THRESHOLD) return 0;

    const memberIds = [...byMember.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);

    const exists = await this.prisma.tripBudgetRebalanceSuggestion.findFirst({
      where: { tripId, scenario: 'pace_gap', status: 'pending' },
    });
    if (exists) return 0;

    const message = '成员消费节奏差异较大，建议对齐预期或考虑分组活动';
    const proposal: RebalanceProposal = {
      rationale: `进度差 ${Math.round((max - min) * 100)}% 超过 25% 阈值`,
      memberIds,
    };

    await this.createSuggestion(tripId, 'pace_gap', message, proposal);
    return 1;
  }

  private async upsertSuggestion(
    tripId: string,
    scenario: RebalanceScenario,
    bucket: PsychologicalBucket,
    planned: number,
    actual: number,
    ratio: number,
  ): Promise<number> {
    const exists = await this.prisma.tripBudgetRebalanceSuggestion.findFirst({
      where: { tripId, scenario, status: 'pending' },
    });
    if (exists) return 0;

    const label = bucketLabel(bucket);
    const message =
      scenario === 'surplus'
        ? `${label}桶结余较多，可将部分预算滑移到体验或餐饮`
        : `${label}桶已超支，建议从应急桶调剂或降低该类别强度`;

    const toBucket: PsychologicalBucket =
      scenario === 'surplus'
        ? bucket === 'food'
          ? 'experience'
          : 'food'
        : 'contingency';

    const proposal: RebalanceProposal = {
      fromBucket: bucket,
      toBucket,
      amount: Math.round(Math.abs(planned - actual)),
      rationale:
        scenario === 'surplus'
          ? `实际仅用了计划的 ${Math.round(ratio * 100)}%`
          : `实际达计划的 ${Math.round(ratio * 100)}%`,
    };

    await this.createSuggestion(tripId, scenario, message, proposal);
    return 1;
  }

  private async createSuggestion(
    tripId: string,
    scenario: RebalanceScenario,
    message: string,
    proposal: RebalanceProposal,
  ): Promise<void> {
    const row = await this.prisma.tripBudgetRebalanceSuggestion.create({
      data: {
        tripId,
        scenario,
        message,
        proposal: toInputJsonValue(proposal),
      },
    });

    await this.persistEvent(tripId, TravelEventType.TRIP_IN_TRIP_REBALANCE_SUGGESTED, {
      suggestionId: row.id,
      scenario,
      message,
    });
  }

  private toSummary(row: SuggestionRow): RebalanceSuggestionSummary {
    return {
      id: row.id,
      tripId: row.tripId,
      scenario: row.scenario as RebalanceScenario,
      message: row.message,
      proposal: row.proposal as RebalanceProposal,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async persistEvent(
    tripId: string,
    eventType: TravelEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.travelEventPersistence) return;
    const envelope = buildTravelEventEnvelope({
      tripId,
      segment: TrajectorySegment.DECISION,
      eventType,
      source: TravelEventSource.IN_TRIP_EXECUTION,
      payload,
      idempotencyKey: `${eventType}:${tripId}:${payload.suggestionId ?? DateTime.now().toMillis()}`,
      schemaVersion: 1,
    });
    await this.travelEventPersistence.persist(envelope);
  }
}
