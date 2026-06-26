import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { TravelRiskEvent } from '../../../agent/execution/risk-event.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TripSilentVoteService } from '../../silent-vote/services/trip-silent-vote.service';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import { assessRisksForAnchor } from '../bridge/trip-impact.bridge';
import type {
  EnvironmentAffectedItem,
  EnvironmentAlternativePlan,
  EnvironmentEventDetail,
  EnvironmentEventSummary,
  EnvironmentResolveInput,
  EnvironmentVoteInput,
} from '../types/environment-event.types';
import { impactSeverityToEnvironment, urgencyToSeverity } from '../utils/severity.util';
import { AlternativePlanGeneratorService } from './alternative-plan-generator.service';
import { AnchorHandoffService } from './anchor-handoff.service';
import { EnvironmentDataAdapter } from './environment-data.adapter';
import { InTripAccessService } from './in-trip-access.service';
import { VulnerabilityScoreService } from './vulnerability-score.service';
import { LoopTriggerBridgeService } from '../../../loops/services/loop-trigger-bridge.service';

type EventRow = {
  id: string;
  tripId: string;
  type: string;
  severity: string;
  description: string;
  affectedItems: unknown;
  alternativePlans: unknown;
  cascadeImpact: unknown;
  resolution: unknown;
  silentVoteId: string | null;
  detectedAt: Date;
  resolvedAt: Date | null;
  status: string;
};

@Injectable()
export class EnvironmentRadarService {
  private readonly logger = new Logger(EnvironmentRadarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly dataAdapter: EnvironmentDataAdapter,
    private readonly planGenerator: AlternativePlanGeneratorService,
    private readonly vulnerability: VulnerabilityScoreService,
    private readonly silentVote: TripSilentVoteService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
    @Optional() private readonly loopTriggerBridge?: LoopTriggerBridgeService,
  ) {}

  async listOpenEvents(tripId: string, userId: string): Promise<EnvironmentEventSummary[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const rows = await this.prisma.tripEnvironmentEvent.findMany({
      where: { tripId, status: { in: ['open', 'voting'] } },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });
    return rows.map((r) => this.toSummary(r));
  }

  async getEvent(tripId: string, eventId: string, userId: string): Promise<EnvironmentEventDetail> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    const row = await this.requireEvent(tripId, eventId);
    return this.toDetail(row);
  }

  async listVulnerability(tripId: string, userId: string) {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    return this.vulnerability.listScores(tripId);
  }

  async voteOnEvent(
    tripId: string,
    eventId: string,
    userId: string,
    input: EnvironmentVoteInput,
  ) {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const row = await this.requireEvent(tripId, eventId);
    if (!row.silentVoteId) {
      throw new BadRequestException('该事件尚未开启投票');
    }
    if (row.status === 'resolved') {
      throw new BadRequestException('事件已解决，无法投票');
    }

    const plans = row.alternativePlans as EnvironmentAlternativePlan[];
    const plan = plans.find((p) => p.planId === input.planId);
    if (!plan?.silentVoteOptionId) {
      throw new BadRequestException(`无效方案 ${input.planId}`);
    }

    const ballot = await this.silentVote.submitBallot(tripId, row.silentVoteId, userId, {
      optionId: plan.silentVoteOptionId,
      intensity: Math.min(5, Math.max(1, Math.round(input.preferenceStrength))),
    });

    if (row.status === 'open') {
      await this.prisma.tripEnvironmentEvent.update({
        where: { id: eventId },
        data: { status: 'voting' },
      });
    }

    return { eventId, ballot, comment: input.comment ?? null };
  }

  async resolveEvent(
    tripId: string,
    eventId: string,
    userId: string,
    input: EnvironmentResolveInput = {},
  ) {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertOrganizer(tripId, userId);

    const row = await this.requireEvent(tripId, eventId);
    if (row.status === 'resolved') {
      return this.toDetail(row);
    }

    let selectedPlanId = input.planId;
    const voteResults: Record<string, { ballots: number; weightedScore: number }> = {};

    if (row.silentVoteId) {
      const voteDetail = await this.silentVote.getVote(tripId, row.silentVoteId, userId);
      const dist = voteDetail.aggregate.optionDistribution ?? [];
      const heatmap = voteDetail.aggregate.intensityHeatmap ?? [];

      for (const opt of dist) {
        const heat = heatmap.find((h) => h.optionId === opt.optionId);
        voteResults[opt.optionId] = {
          ballots: opt.count,
          weightedScore: heat?.weightedScore ?? opt.count,
        };
      }

      if (!selectedPlanId) {
        const leading = [...heatmap].sort((a, b) => b.weightedScore - a.weightedScore)[0];
        if (leading) {
          const plans = row.alternativePlans as EnvironmentAlternativePlan[];
          const winner = plans.find((p) => p.silentVoteOptionId === leading.optionId);
          selectedPlanId = winner?.planId;
        }
      }
      await this.silentVote.closeVote(tripId, row.silentVoteId, userId);
    }

    if (!selectedPlanId) {
      throw new BadRequestException('请指定 planId 或等待投票产生领先方案');
    }

    const resolvedAt = new Date().toISOString();
    const updated = await this.prisma.tripEnvironmentEvent.update({
      where: { id: eventId },
      data: {
        status: 'resolved',
        resolvedAt: new Date(resolvedAt),
        resolution: toInputJsonValue({
          selectedPlanId,
          voteResults,
          resolvedAt,
          resolvedBy: userId,
        }),
      },
    });

    await this.persistEnvironmentEvent(tripId, TravelEventType.TRIP_IN_TRIP_ENVIRONMENT_RESOLVED, {
      eventId,
      selectedPlanId,
    }, userId);

    return this.toDetail(updated);
  }

  /** 监测任务入口：扫描风险并写入事件 */
  async scanTripEnvironment(tripId: string, actorUserId = 'system'): Promise<number> {
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    if (!anchor) return 0;

    const risks = await this.dataAdapter.collectRiskSignals(anchor);
    if (risks.length === 0) return 0;

    const impacts = assessRisksForAnchor(anchor, risks);
    let created = 0;

    for (let i = 0; i < risks.length; i++) {
      const risk = risks[i];
      const impact = impacts[i];
      const severity = impact
        ? impactSeverityToEnvironment(impact.severity)
        : urgencyToSeverity(risk.urgency);

      if (severity === 'green') continue;

      const dup = await this.prisma.tripEnvironmentEvent.findFirst({
        where: {
          tripId,
          description: risk.message,
          status: { in: ['open', 'voting'] },
        },
      });
      if (dup) continue;

      await this.createEventFromRisk(tripId, risk, impact, anchor, severity, actorUserId);
      created += 1;
    }

    const summaries = (await this.listOpenEventsInternal(tripId)).map((r) => this.toSummary(r));
    await this.vulnerability.recomputeForTrip(tripId, anchor, summaries);

    return created;
  }

  private async createEventFromRisk(
    tripId: string,
    risk: TravelRiskEvent,
    impact: ReturnType<typeof assessRisksForAnchor>[number] | undefined,
    anchor: Awaited<ReturnType<AnchorHandoffService['getSnapshot']>>,
    severity: 'yellow' | 'red',
    actorUserId: string,
  ) {
    const affectedIds = impact?.affectedItems ?? [];
    const affectedItems = this.mapAffectedItems(anchor!, affectedIds);
    const { plans, cascadeImpact } = this.planGenerator.generate(
      anchor!,
      risk.message,
      impact ?? {
        eventId: risk.id,
        affectedItems: affectedIds,
        affectedDays: [],
        severity: 'MEDIUM',
        recommendedActions: ['ASK_USER'],
        rootConfidence: risk.confidence,
        propagationDepth: 0,
        cascadeConfidence: risk.confidence,
        summaryZh: risk.message,
      },
      affectedIds,
    );

    let silentVoteId: string | undefined;
    let plansWithOptions = plans;

    if (severity === 'red') {
      const vote = await this.silentVote.createVote(tripId, actorUserId, {
        title: '环境变化 — 替代方案选择',
        question: risk.message,
        options: plans.map((p) => ({
          id: `opt-${p.planId.slice(0, 8)}`,
          label: p.name,
          summaryRef: p.planId,
        })),
        autoOpen: true,
      });
      silentVoteId = vote.id;
      plansWithOptions = plans.map((p, idx) => ({
        ...p,
        silentVoteOptionId: vote.options[idx]?.id ?? `opt-${p.planId.slice(0, 8)}`,
      }));
    }

    const detectedAt = new Date();
    const row = await this.prisma.tripEnvironmentEvent.create({
      data: {
        tripId,
        type: this.riskCategoryToType(risk.category),
        severity,
        description: risk.message,
        affectedItems: toInputJsonValue(affectedItems),
        alternativePlans: toInputJsonValue(plansWithOptions),
        cascadeImpact: toInputJsonValue(cascadeImpact),
        silentVoteId,
        detectedAt,
        sourceObservedAt: new Date(risk.observedAt),
        status: severity === 'red' && silentVoteId ? 'voting' : 'open',
      },
    });

    await this.persistEnvironmentEvent(tripId, TravelEventType.TRIP_IN_TRIP_ENVIRONMENT_DETECTED, {
      eventId: row.id,
      severity,
      description: risk.message,
    }, actorUserId);

    if (this.loopTriggerBridge) {
      void this.loopTriggerBridge.notifyEnvironmentDetected({
        tripId,
        environmentEventId: row.id,
        userId: actorUserId,
        eventType: this.riskCategoryToType(risk.category),
      });
    }

    return row;
  }

  private mapAffectedItems(
    anchor: NonNullable<Awaited<ReturnType<AnchorHandoffService['getSnapshot']>>>,
    itemIds: string[],
  ): EnvironmentAffectedItem[] {
    const out: EnvironmentAffectedItem[] = [];
    for (const id of itemIds) {
      for (const day of anchor.itinerary.days) {
        const item = day.items.find((it) => it.id === id);
        if (!item) continue;
        out.push({
          itemType: /FOOD|DINING/i.test(item.type)
            ? 'dining'
            : /HOTEL|ACCOMMODATION/i.test(item.type)
              ? 'accommodation'
              : /FLIGHT|TRANSPORT/i.test(item.type)
                ? 'transport'
                : 'activity',
          itemId: item.id,
          itemName: item.title,
          originalTime: item.startTime,
          refundable: item.refundable,
        });
      }
    }
    return out;
  }

  private riskCategoryToType(category: TravelRiskEvent['category']) {
    if (category === 'WEATHER_NATURAL') return 'weather';
    if (category === 'TRANSPORT_DISRUPTION' || category === 'ROAD_ACCESS') return 'traffic';
    if (category === 'OPENING_CLOSURE') return 'attraction';
    return 'other';
  }

  private async listOpenEventsInternal(tripId: string) {
    return this.prisma.tripEnvironmentEvent.findMany({
      where: { tripId, status: { in: ['open', 'voting'] } },
    });
  }

  private async requireEvent(tripId: string, eventId: string): Promise<EventRow> {
    const row = await this.prisma.tripEnvironmentEvent.findFirst({
      where: { id: eventId, tripId },
    });
    if (!row) throw new NotFoundException(`环境事件 ${eventId} 不存在`);
    return row;
  }

  private toSummary(row: EventRow): EnvironmentEventSummary {
    const affected = (row.affectedItems as unknown[]) ?? [];
    const plans = (row.alternativePlans as unknown[]) ?? [];
    return {
      id: row.id,
      tripId: row.tripId,
      type: row.type as EnvironmentEventSummary['type'],
      severity: row.severity as EnvironmentEventSummary['severity'],
      description: row.description,
      status: row.status as EnvironmentEventSummary['status'],
      detectedAt: row.detectedAt.toISOString(),
      affectedItemCount: affected.length,
      alternativePlanCount: plans.length,
      silentVoteId: row.silentVoteId ?? undefined,
    };
  }

  private toDetail(row: EventRow): EnvironmentEventDetail {
    return {
      ...this.toSummary(row),
      affectedItems: (row.affectedItems as EnvironmentAffectedItem[]) ?? [],
      alternativePlans: (row.alternativePlans as EnvironmentAlternativePlan[]) ?? [],
      cascadeImpact: (row.cascadeImpact as EnvironmentEventDetail['cascadeImpact']) ?? [],
      resolution: (row.resolution as EnvironmentEventDetail['resolution']) ?? undefined,
      resolvedAt: row.resolvedAt?.toISOString(),
    };
  }

  private async persistEnvironmentEvent(
    tripId: string,
    eventType: TravelEventType,
    payload: Record<string, unknown>,
    userId?: string,
  ) {
    if (!this.travelEventPersistence) return;
    const timestamp = new Date().toISOString();
    const idempotencyKey = [tripId, eventType, payload.eventId ?? randomUUID(), timestamp].join('|');
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment: eventType === TravelEventType.TRIP_IN_TRIP_ENVIRONMENT_DETECTED
          ? TrajectorySegment.DECISION
          : TrajectorySegment.ACTION,
        eventType,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        payload,
        userId,
        timestamp,
        idempotencyKey,
      }),
    );
  }
}
