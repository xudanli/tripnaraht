/**
 * WP1 — run Legacy vs RFC-001 shadow comparison for Iceland road close.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import type { StrategyOrchestratorService } from '../../decision/services/strategy-orchestrator.service';
import type { AbuStrategy } from '../../decision/strategies/abu-strategy.service';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { RoadSegmentBindings } from '../detection/road-close-impact.types';
import { RoadSegmentUnavailableRunnerService } from '../execution/road-segment-unavailable-runner.service';
import { LegacyRfc001ComparatorService } from './legacy-rfc001-comparator.service';
import type {
  ShadowComparisonAggregate,
  ShadowComparisonResult,
} from './shadow-decision-snapshot.types';
import { buildMinimalEvaluateWorld } from '../orchestration/minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import { isRfc001ShadowMode } from '../config/rfc001-iceland.config';

const METADATA_KEY = 'rfc001ShadowComparisons';
const MAX_COMPARISONS = 100;

export interface StoredShadowComparisons {
  items: ShadowComparisonResult[];
  aggregate?: ShadowComparisonAggregate;
  lastUpdatedAt?: string;
}

@Injectable()
export class RoadSegmentUnavailableShadowService {
  private readonly logger = new Logger(RoadSegmentUnavailableShadowService.name);
  private readonly recentResults: ShadowComparisonResult[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: RoadSegmentUnavailableRunnerService,
    private readonly comparator: LegacyRfc001ComparatorService,
    @Optional() private readonly legacyOrchestrator?: StrategyOrchestratorService,
    @Optional() private readonly abu?: AbuStrategy,
  ) {}

  async compareFromEvent(
    event: RoadStatusChangedEvent,
    opts?: { bindings?: RoadSegmentBindings; persist?: boolean },
  ): Promise<ShadowComparisonResult> {
    const tripId = event.aggregateId;
    const roadStatus = event.payload.status;

    const rfcStart = Date.now();
    const prevShadow = process.env.RFC001_SHADOW_MODE;
    process.env.RFC001_SHADOW_MODE = '1';
    let rfcRun;
    try {
      rfcRun = await this.runner.runFullFromEvent(event, { bindings: opts?.bindings });
    } finally {
      if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
      else process.env.RFC001_SHADOW_MODE = prevShadow;
    }
    const rfcLatency = Date.now() - rfcStart;

    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for shadow trip ${tripId}`);
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const countryCode = resolveTripDestinationCountry(trip?.destination) ?? 'GLOBAL';

    const world = buildMinimalEvaluateWorld({
      countryCode,
      roadId: event.payload.roadId,
      roadStatus,
    });

    const affectedPlanItemIds =
      rfcRun.problem?.affectedPlanItemIds ??
      (plan.segments ?? [])
        .map((s) => (s.metadata as any)?.itineraryItemId as string)
        .filter(Boolean);

    const legacyStart = Date.now();
    const legacyResult = await this.runLegacyPath(world, plan);
    const legacyLatency = Date.now() - legacyStart;

    const legacySnapshot = this.comparator.snapshotFromLegacyOrchestrator({
      result: legacyResult,
      basePlan: plan,
      affectedPlanItemIds,
      latencyMs: legacyLatency,
    });

    const rfcSnapshot = this.comparator.snapshotFromRfc001Run({
      affectedPlanItemIds,
      record: rfcRun.record,
      workspace: rfcRun.workspace,
      latencyMs: rfcLatency,
    });

    const comparison = this.comparator.compare({
      tripId,
      eventId: event.eventId,
      legacy: legacySnapshot,
      rfc001: rfcSnapshot,
    });

    this.recentResults.push(comparison);
    if (this.recentResults.length > 50) this.recentResults.shift();

    if (opts?.persist !== false) {
      await this.persistComparison(tripId, comparison);
    }

    this.logger.debug(
      `shadow trip=${tripId} diff=${comparison.diff.kind} hardBlockAgree=${comparison.metrics.hardBlockAgreement} shadowMode=${isRfc001ShadowMode()}`,
    );

    return comparison;
  }

  getInMemoryAggregate(): ShadowComparisonAggregate {
    return this.comparator.aggregate(this.recentResults);
  }

  async getStoredAggregate(tripId: string): Promise<ShadowComparisonAggregate> {
    const block = await this.readBlock(tripId);
    return (
      block.aggregate ??
      this.comparator.aggregate(block.items)
    );
  }

  async listStored(tripId: string): Promise<StoredShadowComparisons> {
    return this.readBlock(tripId);
  }

  private async runLegacyPath(
    world: Parameters<StrategyOrchestratorService['run']>[0],
    plan: Parameters<StrategyOrchestratorService['run']>[1],
  ): Promise<{
    allowed: boolean;
    finalAction: string;
    plan: { segments?: Array<{ metadata?: Record<string, unknown> }> } | null;
    logs: Array<{ reasonCodes?: string[] }>;
  }> {
    if (this.legacyOrchestrator) {
      const result = await this.legacyOrchestrator.run(world, plan, {
        enablePersonaClosureLoop: false,
      });
      return result;
    }

    if (this.abu) {
      const abuResult = await this.abu.evaluate(world, plan);
      return {
        allowed: abuResult.allowed,
        finalAction: abuResult.allowed ? 'ALLOW' : 'REJECT',
        plan: abuResult.updatedPlan ?? plan,
        logs: abuResult.logs,
      };
    }

    const closed = world.physical.roadStates?.some((r) => r.status === 'CLOSED');
    return {
      allowed: !closed,
      finalAction: closed ? 'REJECT' : 'ALLOW',
      plan: closed ? null : plan,
      logs: closed ? [{ reasonCodes: ['ROAD_CLOSED_STUB'] }] : [],
    };
  }

  private async persistComparison(
    tripId: string,
    comparison: ShadowComparisonResult,
  ): Promise<void> {
    const block = await this.readBlock(tripId);
    const items = [...block.items, comparison].slice(-MAX_COMPARISONS);
    const aggregate = this.comparator.aggregate(items);
    await this.writeBlock(tripId, { items, aggregate });
  }

  private async readBlock(tripId: string): Promise<StoredShadowComparisons> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as StoredShadowComparisons | undefined;
    return { items: block?.items ?? [], aggregate: block?.aggregate };
  }

  private async writeBlock(
    tripId: string,
    block: StoredShadowComparisons,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: {
            ...block,
            lastUpdatedAt: new Date().toISOString(),
          },
        }),
      },
    });
  }
}
