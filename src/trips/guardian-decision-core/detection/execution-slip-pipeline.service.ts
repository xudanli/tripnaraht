/**
 * Slice 3 E5 — execution slip pipeline: observation → evidence → problem.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { ExecutionDepartureObservation } from '../contracts/execution-slip.types';
import {
  EvidenceResolverService,
  type ResolveExecutionDepartureSlipResult,
} from '../evidence/evidence-resolver.service';
import { buildExecutionDepartureSlipEvent } from '../evidence/execution-departure-changed.event';
import { PoiExecutionWindowResolverService } from '../services/poi-execution-window.resolver';
import { DecisionProblemDetectorService } from './decision-problem-detector.service';
import {
  analyzeExecutionSlipImpact,
  type ExecutionSlipImpactResult,
} from './execution-slip-impact-analyzer';
import type { EffectivePlanActivity } from '../contracts/execution-slip.types';
import { resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';
import {
  readActivityContextFromTripMetadata,
  resolvePlannedDepartAt,
  resolveRemainingStayMinutes,
} from '../utils/execution-activity-context.util';
import type { TepExecutionSlipDaylightBridgeService } from '../../tep/services/tep-execution-slip-daylight.bridge';
import type { TepRuntimeTriggerResult } from '../../tep/services/tep-runtime-trigger.service';

export interface ExecutionSlipPipelineResult {
  evidence: ResolveExecutionDepartureSlipResult;
  impact: ExecutionSlipImpactResult;
  problem: Rfc001DecisionProblem | null;
  tepDaylightTrigger?: TepRuntimeTriggerResult | null;
}

@Injectable()
export class ExecutionSlipPipelineService {
  private readonly logger = new Logger(ExecutionSlipPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceResolver: EvidenceResolverService,
    private readonly windowResolver: PoiExecutionWindowResolverService,
    private readonly problemDetector: DecisionProblemDetectorService,
    @Optional() private readonly tepSlipDaylight?: TepExecutionSlipDaylightBridgeService,
  ) {}

  async runFromObservation(
    observation: ExecutionDepartureObservation,
    opts?: {
      currentActivity?: EffectivePlanActivity;
      nextActivity?: EffectivePlanActivity;
      travelDurationMinutes?: number;
    },
  ): Promise<ExecutionSlipPipelineResult> {
    const tripId = observation.tripId;
    const activities = await this.loadAdjacentActivities(
      tripId,
      observation.activityId,
      opts,
    );

    const nextWindow = await this.windowResolver.resolvePoiExecutionWindow(
      activities.next.activityId,
    );

    const impact = analyzeExecutionSlipImpact({
      tripId,
      observation,
      currentActivity: activities.current,
      nextActivity: activities.next,
      nextWindow,
      travelDurationMinutes:
        opts?.travelDurationMinutes ?? activities.travelDurationMinutes,
    });

    const event = buildExecutionDepartureSlipEvent({
      tripId,
      observationId: observation.observationId,
      activityId: observation.activityId,
      planVersionId: observation.planVersionId,
      plannedDepartAt: observation.plannedDepartAt,
      observedAt: observation.observedAt,
      stillAtPoi: observation.stillAtPoi,
      source: observation.source,
      slipMinutes: impact.assessment.slipMinutes,
      nextActivityId: activities.next.activityId,
      projectedEta: impact.assessment.projectedEta,
      lastEntryAt: nextWindow?.lastEntryAt,
      occurredAt: observation.observedAt,
    });

    const evidence = await this.evidenceResolver.resolveExecutionDepartureSlip(
      event,
      { scheduleInfeasible: impact.assessment.infeasible },
    );

    const problem = impact.assessment.infeasible
      ? await this.problemDetector.detectExecutionSlipProblem({
          tripId,
          event: evidence.event,
          assertion: evidence.assertion,
          snapshot: evidence.snapshot,
          impact,
        })
      : null;

    let tepDaylightTrigger: TepRuntimeTriggerResult | null = null;
    if (this.tepSlipDaylight) {
      try {
        tepDaylightTrigger = await this.tepSlipDaylight.tryTriggerFromExecutionSlip({
          tripId,
          observation,
          impact,
          triggerEventId: evidence.event.eventId,
          worldStateSnapshotId: evidence.snapshot.snapshotId,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `TEP slip→daylight bridge failed trip=${tripId}: ${message}`,
        );
      }
    }

    this.logger.debug(
      `execution-slip pipeline trip=${tripId} activity=${observation.activityId} infeasible=${impact.assessment.infeasible} problem=${problem?.problemId ?? 'none'} tepDaylight=${tepDaylightTrigger?.hook?.hookId ?? 'none'}`,
    );

    return { evidence, impact, problem, tepDaylightTrigger };
  }

  private async loadAdjacentActivities(
    tripId: string,
    activityId: string,
    opts?: {
      currentActivity?: EffectivePlanActivity;
      nextActivity?: EffectivePlanActivity;
      travelDurationMinutes?: number;
    },
  ): Promise<{
    current: EffectivePlanActivity;
    next: EffectivePlanActivity;
    travelDurationMinutes: number;
  }> {
    if (opts?.currentActivity && opts?.nextActivity) {
      return {
        current: opts.currentActivity,
        next: opts.nextActivity,
        travelDurationMinutes: opts.travelDurationMinutes ?? 103,
      };
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        metadata: true,
        TripDay: {
          orderBy: { date: 'asc' },
          select: {
            id: true,
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              select: {
                id: true,
                placeId: true,
                startTime: true,
                endTime: true,
                travelFromPreviousDuration: true,
              },
            },
          },
        },
      },
    });

    const items =
      trip?.TripDay.flatMap((d, dayIndex: number) =>
        d.ItineraryItem.map((item) => ({ ...item, dayIndex })),
      ) ?? [];

    const idx = items.findIndex((i) => i.id === activityId);
    if (idx < 0 || idx >= items.length - 1) {
      throw new Error(
        `Activity ${activityId} not found or has no next activity on trip ${tripId}`,
      );
    }

    const currentItem = items[idx];
    const nextItem = items[idx + 1];

    const currentContext = readActivityContextFromTripMetadata(
      trip?.metadata,
      currentItem.id,
    );
    const remainingStayMinutes = resolveRemainingStayMinutes(currentContext, 60);

    const current: EffectivePlanActivity = {
      activityId: currentItem.id,
      poiId: currentItem.placeId != null ? String(currentItem.placeId) : undefined,
      plannedDepartAt:
        resolvePlannedDepartAt({
          context: currentContext,
          endTime: currentItem.endTime,
          startTime: currentItem.startTime,
        }) ?? new Date().toISOString(),
      plannedStartAt: currentItem.startTime?.toISOString(),
      plannedEndAt: currentItem.endTime?.toISOString(),
      travelDurationMinutes: 0,
      remainingStayMinutes,
      dayIndex: currentItem.dayIndex,
    };

    const next: EffectivePlanActivity = {
      activityId: nextItem.id,
      poiId: nextItem.placeId != null ? String(nextItem.placeId) : undefined,
      plannedDepartAt:
        nextItem.startTime?.toISOString() ?? new Date().toISOString(),
      plannedStartAt: nextItem.startTime?.toISOString(),
      plannedEndAt: nextItem.endTime?.toISOString(),
      travelDurationMinutes: nextItem.travelFromPreviousDuration ?? 103,
      remainingStayMinutes: 0,
      dayIndex: nextItem.dayIndex,
    };

    return {
      current,
      next,
      travelDurationMinutes: nextItem.travelFromPreviousDuration ?? 103,
    };
  }

  async resolvePlanVersionId(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) throw new Error(`Trip not found: ${tripId}`);
    const rev = resolveTripRevision(trip);
    return `plan_${revisionToString(rev)}`;
  }
}
