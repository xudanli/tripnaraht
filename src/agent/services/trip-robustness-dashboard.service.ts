import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { TripRobustnessDashboardResponseDto } from '../dto/trip-robustness-dashboard.dto';
import type { PartyMemberProfile } from '../utils/planning-intent-processor.util';
import {
  mergeRobustnessDashboardCacheIntoMetadata,
  parseRobustnessDashboardCacheFromTripMetadata,
} from '../utils/robustness-dashboard-cache.util';
import {
  runRobustnessRolloutForItinerary,
  serializeRobustnessDashboard,
  type RobustnessDashboardPayload,
} from '../utils/robustness-rollout-gateway.util';
import { tripDbRowHasSchedulableItems, tripDbRowToItinerary } from '../utils/trip-db-to-itinerary.util';
import { projectPartyPersonasFromTripRequest } from '../../trips/decision/persona/project-party-from-request.util';
import { projectRobustnessPartyFromPersonas } from '../../trips/execution-simulation';
import { projectRobustnessPartyFromNegotiationProfiles } from '../../trips/execution-simulation/planning-party-robustness.util';
import { AlignmentTier3PersistenceService } from '../../trips/decision/services/alignment-tier3-persistence.service';
import {
  loadAlignmentTier3Bundle,
} from '../../trips/execution-closure-persistence/persist-alignment-tier3';
import type { AlignmentTier3WireEnvelope } from '../../trips/execution-closure-persistence/alignment-tier3-serialization';
import type { CausalAlignmentTuple } from '../../trips/execution-simulation/alignment-tier3.types';
import type { RolloutTimelineNode } from '../../trips/execution-simulation/robustness-rollout.types';
import {
  isRobustnessRolloutEnabled,
  robustnessRolloutDefaultSampleCount,
} from '../engine/execution-gateway.config';

function partyProfilesFromTripMetadata(metadata: unknown): PartyMemberProfile[] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const raw = (metadata as Record<string, unknown>).party_member_profiles;
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return raw as PartyMemberProfile[];
}

function buildDualCurves(timeline: RolloutTimelineNode[]): TripRobustnessDashboardResponseDto['dual_curves'] {
  return timeline.map((node) => ({
    node_id: node.nodeId,
    timestamp: node.timestamp,
    physical: node.physicsRobustness,
    organizational: Math.max(0, Math.min(1, 1 - node.socialStressIndex)),
    active_perturbations: node.activePerturbations,
  }));
}

function summarizeTuples(
  envelope: AlignmentTier3WireEnvelope | undefined,
  tuples: CausalAlignmentTuple[],
): TripRobustnessDashboardResponseDto['alignment'] {
  const recent = tuples.slice(-10).reverse();
  return {
    organizational_weight: envelope?.rmHints.organizationalWeight,
    physical_weight: envelope?.rmHints.physicalWeight,
    tuple_count: envelope?.rmHints.tupleCount ?? tuples.length,
    last_discard_reason: envelope?.rmHints.lastDiscardReason,
    metadata_revision: envelope ? undefined : undefined,
    recent_tuples: recent.map((t) => ({
      tuple_id: t.tupleId,
      captured_at: t.capturedAt,
      discard_reason: t.discardReason,
      organizational_penalty: t.organizationalPenalty,
      physical_penalty: t.physicalPenalty,
      affected_node_ids: t.affectedNodeIds,
      revision_id:
        typeof t.metadata?.revisionId === 'string' ? t.metadata.revisionId : undefined,
      resolution_type:
        typeof t.metadata?.resolution_type === 'string' ? t.metadata.resolution_type : undefined,
    })),
  };
}

@Injectable()
export class TripRobustnessDashboardService {
  private readonly logger = new Logger(TripRobustnessDashboardService.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly alignmentTier3?: AlignmentTier3PersistenceService,
  ) {}

  /** Best-effort cache write after Execution Gateway enrichment. */
  scheduleCacheDashboard(tripId: string | null | undefined, dashboard: RobustnessDashboardPayload): void {
    const id = String(tripId ?? '').trim();
    if (!id || !this.prisma) return;
    void this.cacheDashboard(id, dashboard).catch((e) => {
      this.logger.warn(`cacheDashboard failed: ${(e as Error)?.message ?? e}`);
    });
  }

  async cacheDashboard(tripId: string, dashboard: RobustnessDashboardPayload): Promise<void> {
    if (!this.prisma) return;
    await this.prisma.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;
      const prev = (trip.metadata as Record<string, unknown>) ?? {};
      const metadata = mergeRobustnessDashboardCacheIntoMetadata(prev, dashboard);
      await tx.trip.update({
        where: { id: tripId },
        data: { metadata: JSON.parse(JSON.stringify(metadata)) as object, updatedAt: new Date() },
      });
    });
  }

  async getTripRobustnessDashboard(
    tripId: string,
    opts?: { forceRecompute?: boolean },
  ): Promise<TripRobustnessDashboardResponseDto> {
    const id = String(tripId ?? '').trim();
    const computedAt = new Date().toISOString();

    if (!id || !this.prisma) {
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'computation_failed',
        dual_curves: [],
        alignment: { recent_tuples: [] },
        computed_at: computedAt,
      };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id },
      select: {
        id: true,
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              include: { Place: { select: { id: true, nameCN: true, nameEN: true } } },
            },
          },
        },
      },
    });

    if (!trip) {
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'trip_not_found',
        dual_curves: [],
        alignment: { recent_tuples: [] },
        computed_at: computedAt,
      };
    }

    const meta = (trip.metadata as Record<string, unknown>) ?? {};
    const { envelope: alignmentEnvelope, revision: alignmentRevision } = loadAlignmentTier3Bundle(meta);
    const alignmentTuples = alignmentEnvelope?.tuples ?? (await this.alignmentTier3?.loadTuples(id)) ?? [];
    const alignment = summarizeTuples(alignmentEnvelope, alignmentTuples);
    alignment.metadata_revision = alignmentRevision;

    const cached = parseRobustnessDashboardCacheFromTripMetadata(meta.robustnessDashboardV1);
    if (cached && !opts?.forceRecompute) {
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'cached',
        rollout: cached.dashboard as unknown as Record<string, unknown>,
        cached_at: cached.cached_at,
        dual_curves: buildDualCurves(cached.dashboard.timeline),
        alignment,
        computed_at: computedAt,
      };
    }

    if (!tripDbRowHasSchedulableItems(trip)) {
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'empty_itinerary',
        dual_curves: [],
        alignment,
        computed_at: computedAt,
      };
    }

    if (!isRobustnessRolloutEnabled()) {
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'computation_failed',
        dual_curves: [],
        alignment,
        computed_at: computedAt,
      };
    }

    try {
      const itinerary = tripDbRowToItinerary(trip)!;
      const profiles = partyProfilesFromTripMetadata(meta);
      const request = this.buildSyntheticRequest(id, meta, profiles);
      const partyOverride = profiles?.length
        ? projectRobustnessPartyFromNegotiationProfiles(profiles, id)
        : projectRobustnessPartyFromPersonas(
            projectPartyPersonasFromTripRequest({
              party: { count: 1, fitness_level: 'medium' },
            }),
            id,
          );

      const result = runRobustnessRolloutForItinerary({
        request,
        itinerary,
        sampleCount: robustnessRolloutDefaultSampleCount(),
        partyOverride,
      });

      if (!result) {
        return {
          trip_id: id,
          schema: 'tripnara.trip_robustness_dashboard@v1',
          status: 'computation_failed',
          dual_curves: [],
          alignment,
          computed_at: computedAt,
        };
      }

      const dashboard = serializeRobustnessDashboard(result, {
        partyId: id,
        memberCount: profiles?.length ?? 1,
        sampleCount: result.sampleSummaries.length,
      });

      void this.cacheDashboard(id, dashboard);

      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'ready',
        rollout: dashboard as unknown as Record<string, unknown>,
        dual_curves: buildDualCurves(dashboard.timeline),
        alignment,
        computed_at: computedAt,
      };
    } catch (e) {
      this.logger.warn(`getTripRobustnessDashboard compute failed: ${(e as Error)?.message ?? e}`);
      return {
        trip_id: id,
        schema: 'tripnara.trip_robustness_dashboard@v1',
        status: 'computation_failed',
        dual_curves: [],
        alignment,
        computed_at: computedAt,
      };
    }
  }

  private buildSyntheticRequest(
    tripId: string,
    metadata: Record<string, unknown>,
    profiles?: PartyMemberProfile[],
  ): RouteAndRunRequestDto {
    const request: RouteAndRunRequestDto = {
      request_id: `robustness-dashboard-${tripId}`,
      user_id: 'anonymous',
      message: 'robustness-dashboard-read',
      trip_id: tripId,
      options: {},
    };
    if (profiles?.length) {
      request.options = { party_negotiation_member_profiles: profiles };
    }
    const fitness = metadata.fitness_level;
    if (typeof fitness === 'string') {
      request.fitness_level = fitness as RouteAndRunRequestDto['fitness_level'];
    }
    return request;
  }
}
