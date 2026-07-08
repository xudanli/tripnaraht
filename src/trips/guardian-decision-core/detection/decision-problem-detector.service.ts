/**
 * PR-B — create Rfc001DecisionProblem from road-close evidence + impact.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { WorldStateSnapshot } from '../contracts/world-state.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { WeatherHazardChangedEvent } from '../evidence/weather-hazard-changed.event';
import type { DailyLoadChangedEvent } from '../evidence/daily-load-changed.event';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import type { WeatherHazardAssertionPayload } from '../adapters/weather-hazard-to-assertion.adapter';
import type { DailyLoadAssertionPayload } from '../adapters/daily-load-to-assertion.adapter';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import {
  assertRoadCloseHasPlanItems,
  type RoadCloseImpactResult,
} from './road-close-impact-analyzer';
import type { WeatherActivityImpactResult } from './weather-activity-impact-analyzer';
import {
  assertExcessiveLoadImpactHasPlanItems,
  type ExcessiveDailyLoadImpactResult,
} from './excessive-daily-load-impact-analyzer';
import {
  isExcessiveDailyLoadProblemInProgress,
} from './excessive-daily-load-problem.util';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';

export interface DetectRoadCloseProblemInput {
  tripId: string;
  event: RoadStatusChangedEvent;
  assertion: WorldStateAssertion<RoadStatusAssertionPayload>;
  snapshot: WorldStateSnapshot;
  impact: RoadCloseImpactResult;
}

@Injectable()
export class DecisionProblemDetectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  /**
   * Open a FEASIBILITY_FAILURE problem when road closure affects plan items.
   * Returns null for non-closure statuses (OPEN) or zero plan-item impact.
   */
  async detectRoadCloseProblem(
    input: DetectRoadCloseProblemInput,
  ): Promise<Rfc001DecisionProblem | null> {
    const status = input.assertion.payload.status;
    if (status !== 'CLOSED' && status !== 'LIMITED') {
      return null;
    }

    assertRoadCloseHasPlanItems(input.impact);

    const existing = await this.problemStore.findOpenByTriggerEvent(
      input.tripId,
      input.event.eventId,
    );
    if (existing) return existing;

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const rev = resolveTripRevision(trip);
    const planVersionId = `plan_${revisionToString(rev)}`;

    const problem: Rfc001DecisionProblem = {
      problemId: `problem_road_${input.impact.roadId}_${input.tripId.slice(0, 8)}_${Date.now()}`,
      tripId: input.tripId,
      planVersionId,
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: input.event.eventId,
      affectedEntityRefs: input.impact.affectedEntityRefs,
      affectedPlanItemIds: input.impact.affectedPlanItemIds,
      worldStateSnapshotId: input.snapshot.snapshotId,
      detectedAt: new Date().toISOString(),
      urgency: status === 'CLOSED' ? 'HIGH' : 'MEDIUM',
      status: 'OPEN',
    };

    return this.problemStore.upsert(input.tripId, problem);
  }

  /**
   * Open a weather/activity prohibition problem when hazardous conditions affect outdoor items.
   */
  async detectWeatherActivityProblem(input: {
    tripId: string;
    event: WeatherHazardChangedEvent;
    assertion: WorldStateAssertion<WeatherHazardAssertionPayload>;
    snapshot: WorldStateSnapshot;
    impact: WeatherActivityImpactResult;
  }): Promise<Rfc001DecisionProblem | null> {
    if (!input.impact.affectedPlanItemIds.length) {
      return null;
    }

    const effectiveWind = Math.max(
      input.assertion.payload.windSpeedKmh,
      input.assertion.payload.windGustKmh ?? 0,
    );
    if (effectiveWind < 90 && !input.assertion.payload.requiresGuide) {
      return null;
    }

    const existing = await this.problemStore.findOpenByTriggerEvent(
      input.tripId,
      input.event.eventId,
    );
    if (existing) return existing;

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const rev = resolveTripRevision(trip);
    const planVersionId = `plan_${revisionToString(rev)}`;

    const problem: Rfc001DecisionProblem = {
      problemId: `problem_weather_${input.tripId.slice(0, 8)}_${Date.now()}`,
      tripId: input.tripId,
      planVersionId,
      type: 'FEASIBILITY_FAILURE',
      triggerEventId: input.event.eventId,
      semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
      affectedEntityRefs: input.impact.affectedEntityRefs,
      affectedPlanItemIds: input.impact.affectedPlanItemIds,
      worldStateSnapshotId: input.snapshot.snapshotId,
      detectedAt: new Date().toISOString(),
      urgency: effectiveWind >= 90 ? 'HIGH' : 'MEDIUM',
      status: 'OPEN',
    };

    return this.problemStore.upsert(input.tripId, problem);
  }

  /**
   * Open an EXCESSIVE_LOAD problem when daily driving hours exceed threshold.
   */
  async detectExcessiveDailyLoadProblem(input: {
    tripId: string;
    event: DailyLoadChangedEvent;
    assertion: WorldStateAssertion<DailyLoadAssertionPayload>;
    snapshot: WorldStateSnapshot;
    impact: ExcessiveDailyLoadImpactResult;
  }): Promise<Rfc001DecisionProblem | null> {
    if (input.assertion.payload.drivingHours <= input.assertion.payload.thresholdHours) {
      return null;
    }

    assertExcessiveLoadImpactHasPlanItems(input.impact);

    const dayIndex = input.impact.dayIndex;

    const existing = await this.problemStore.findOpenByTriggerEvent(
      input.tripId,
      input.event.eventId,
    );
    if (existing) return existing;

    const existingByDay = await this.problemStore.findOpenExcessiveDailyLoadByDay(
      input.tripId,
      dayIndex,
    );

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) {
      throw new Error(`Trip not found: ${input.tripId}`);
    }

    const rev = resolveTripRevision(trip);
    const planVersionId = `plan_${revisionToString(rev)}`;

    const urgency: Rfc001DecisionProblem['urgency'] =
      input.impact.drivingHours >= input.impact.thresholdHours * 1.25
        ? 'HIGH'
        : 'MEDIUM';

    if (existingByDay) {
      if (isExcessiveDailyLoadProblemInProgress(existingByDay)) {
        await this.problemStore.supersedeDuplicateOpenLoadProblems(
          input.tripId,
          dayIndex,
          existingByDay.problemId,
        );
        return existingByDay;
      }

      const updated: Rfc001DecisionProblem = {
        ...existingByDay,
        planVersionId,
        triggerEventId: input.event.eventId,
        affectedEntityRefs: input.impact.affectedEntityRefs,
        affectedPlanItemIds: input.impact.affectedPlanItemIds,
        worldStateSnapshotId: input.snapshot.snapshotId,
        detectedAt: new Date().toISOString(),
        urgency,
        status: 'OPEN',
      };
      await this.problemStore.supersedeDuplicateOpenLoadProblems(
        input.tripId,
        dayIndex,
        existingByDay.problemId,
      );
      return this.problemStore.upsert(input.tripId, updated);
    }

    const problem: Rfc001DecisionProblem = {
      problemId: `problem_load_${input.tripId.slice(0, 8)}_${Date.now()}`,
      tripId: input.tripId,
      planVersionId,
      type: 'EXCESSIVE_LOAD',
      triggerEventId: input.event.eventId,
      semanticCapability: 'EXCESSIVE_DAILY_LOAD',
      affectedEntityRefs: input.impact.affectedEntityRefs,
      affectedPlanItemIds: input.impact.affectedPlanItemIds,
      worldStateSnapshotId: input.snapshot.snapshotId,
      detectedAt: new Date().toISOString(),
      urgency,
      status: 'OPEN',
    };

    await this.problemStore.supersedeDuplicateOpenLoadProblems(
      input.tripId,
      dayIndex,
      problem.problemId,
    );
    return this.problemStore.upsert(input.tripId, problem);
  }
}
