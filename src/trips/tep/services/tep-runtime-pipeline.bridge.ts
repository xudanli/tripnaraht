/**
 * WP-TEP-11/12 — Bridge RFC-001 evidence pipelines → TEP DecisionHook runtime trigger
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ResolveRoadStatusChangedResult } from '../../guardian-decision-core/evidence/evidence-resolver.service';
import type { ResolveWeatherHazardChangedResult } from '../../guardian-decision-core/evidence/evidence-resolver.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TepRuntimeTriggerService,
  type TepRuntimeTriggerResult,
} from './tep-runtime-trigger.service';

const WEATHER_HOOK_THRESHOLD_KMH = 90;

@Injectable()
export class TepRuntimePipelineBridgeService {
  private readonly logger = new Logger(TepRuntimePipelineBridgeService.name);

  constructor(
    private readonly trigger: TepRuntimeTriggerService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly prisma: PrismaService,
  ) {}

  /** Road pipeline — match stored HOOK-ROAD on WorldState road.status transition */
  async tryTriggerFromRoadEvidence(input: {
    tripId: string;
    evidence: ResolveRoadStatusChangedResult;
  }): Promise<TepRuntimeTriggerResult | null> {
    const status =
      input.evidence.assertion.payload.status ?? input.evidence.event.payload.status;
    const previous =
      input.evidence.event.payload.previousStatus ??
      input.evidence.assertion.payload.previousStatus ??
      'OPEN';

    if (status !== 'CLOSED' && status !== 'LIMITED') {
      return null;
    }

    const planVersionId = await this.resolvePlanVersionId(input.tripId);
    const result = await this.trigger.processObservation({
      tripId: input.tripId,
      planVersionId,
      triggerEventId: input.evidence.event.eventId,
      worldStateSnapshotId: input.evidence.snapshot.snapshotId,
      previousObservation: { 'road.status': previous },
      currentObservation: { 'road.status': status },
    });

    if (result.matched) {
      this.logger.debug(
        `TEP road hook trip=${input.tripId} hook=${result.hook?.hookId} problem=${result.problem?.problemId ?? 'none'}`,
      );
    }

    return result.matched ? result : null;
  }

  /** Weather pipeline — match stored HOOK-WEATHER on wind threshold */
  async tryTriggerFromWeatherEvidence(input: {
    tripId: string;
    evidence: ResolveWeatherHazardChangedResult;
  }): Promise<TepRuntimeTriggerResult | null> {
    const wind = Math.max(
      input.evidence.event.payload.windSpeedKmh,
      input.evidence.event.payload.windGustKmh ?? 0,
    );
    if (wind < WEATHER_HOOK_THRESHOLD_KMH && !input.evidence.event.payload.requiresGuide) {
      return null;
    }

    const planVersionId = await this.resolvePlanVersionId(input.tripId);
    const previousWind = Math.max(0, wind - 50);

    const result = await this.trigger.processObservation({
      tripId: input.tripId,
      planVersionId,
      triggerEventId: input.evidence.event.eventId,
      worldStateSnapshotId: input.evidence.snapshot.snapshotId,
      previousObservation: { 'weather.windSpeedKmh': previousWind },
      currentObservation: { 'weather.windSpeedKmh': wind },
    });

    if (result.matched) {
      this.logger.debug(
        `TEP weather hook trip=${input.tripId} hook=${result.hook?.hookId} problem=${result.problem?.problemId ?? 'none'}`,
      );
    }

    return result.matched ? result : null;
  }

  /** Daylight / night-driving schedule risk — match HOOK-DAYLIGHT on dusk violation */
  async tryTriggerFromDaylightScheduleRisk(input: {
    tripId: string;
    triggerEventId: string;
    worldStateSnapshotId: string;
    driveMinutesAfterCivilDusk?: number;
    activityMinutesAfterSunset?: number;
    previousDriveMinutesAfterCivilDusk?: number;
    previousActivityMinutesAfterSunset?: number;
  }): Promise<TepRuntimeTriggerResult | null> {
    const driveAfter = input.driveMinutesAfterCivilDusk ?? 0;
    const activityAfter = input.activityMinutesAfterSunset ?? 0;
    if (driveAfter <= 0 && activityAfter <= 0) {
      return null;
    }

    const planVersionId = await this.resolvePlanVersionId(input.tripId);
    const result = await this.trigger.processObservation({
      tripId: input.tripId,
      planVersionId,
      triggerEventId: input.triggerEventId,
      worldStateSnapshotId: input.worldStateSnapshotId,
      previousObservation: {
        'daylight.driveMinutesAfterCivilDusk': input.previousDriveMinutesAfterCivilDusk ?? 0,
        'daylight.activityMinutesAfterSunset': input.previousActivityMinutesAfterSunset ?? 0,
      },
      currentObservation: {
        'daylight.driveMinutesAfterCivilDusk': driveAfter,
        'daylight.activityMinutesAfterSunset': activityAfter,
      },
    });

    if (result.matched) {
      this.logger.debug(
        `TEP daylight hook trip=${input.tripId} hook=${result.hook?.hookId} problem=${result.problem?.problemId ?? 'none'}`,
      );
    }

    return result.matched ? result : null;
  }

  private async resolvePlanVersionId(tripId: string): Promise<string> {
    const effective = await this.planVersionStore.getEffectivePlanVersionId(tripId);
    if (effective) return effective;

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    const rev = resolveTripRevision(trip ?? { metadata: {}, updatedAt: new Date() });
    return `plan_${revisionToString(rev)}`;
  }
}
