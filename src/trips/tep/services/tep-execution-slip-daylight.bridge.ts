/**
 * WP-TEP-15 — Execution Slip → TEP daylight schedule risk hook
 */

import { Injectable, Logger } from '@nestjs/common';
import type { ExecutionDepartureObservation } from '../../guardian-decision-core/contracts/execution-slip.types';
import type { ExecutionSlipImpactResult } from '../../guardian-decision-core/detection/execution-slip-impact-analyzer';
import { ExecutabilityAssessmentService } from './executability-assessment.service';
import { TepRuntimePipelineBridgeService } from './tep-runtime-pipeline.bridge';
import type { TepRuntimeTriggerResult } from './tep-runtime-trigger.service';
import {
  buildExecutionSlipDaylightArrivals,
  computeDaylightViolationMinutes,
} from '../utils/daylight-violation-minutes.util';

function countryCodeFromPackId(packId: string): string {
  const match = packId.match(/destination\.([a-z]{2})/i);
  return match?.[1]?.toUpperCase() ?? 'IS';
}

export interface TepExecutionSlipDaylightTriggerInput {
  tripId: string;
  observation: ExecutionDepartureObservation;
  impact: ExecutionSlipImpactResult;
  triggerEventId: string;
  worldStateSnapshotId: string;
}

@Injectable()
export class TepExecutionSlipDaylightBridgeService {
  private readonly logger = new Logger(TepExecutionSlipDaylightBridgeService.name);

  constructor(
    private readonly executability: ExecutabilityAssessmentService,
    private readonly pipelineBridge: TepRuntimePipelineBridgeService,
  ) {}

  /**
   * Re-evaluate SDR-202 daylight window after departure slip and fire HOOK-DAYLIGHT when violated.
   */
  async tryTriggerFromExecutionSlip(
    input: TepExecutionSlipDaylightTriggerInput,
  ): Promise<TepRuntimeTriggerResult | null> {
    if (input.impact.assessment.slipMinutes <= 0) {
      return null;
    }

    let view;
    try {
      view = await this.executability.getExecutability(input.tripId, { refresh: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `TEP slip→daylight skipped trip=${input.tripId}: executability load failed: ${message}`,
      );
      return null;
    }

    const activityRef = input.impact.currentActivityId.startsWith('activity_')
      ? input.impact.currentActivityId
      : `activity_${input.impact.currentActivityId}`;

    const resolvedDay =
      view.dailyDrivePlans.find(
        (d) =>
          d.activities.some((a) => a.ref === activityRef) ||
          d.legs.some((l) => l.fromRef === activityRef || l.toRef === activityRef),
      ) ?? view.dailyDrivePlans[0];

    const resolvedDayIndex = resolvedDay?.dayIndex ?? 1;

    const countryCode = countryCodeFromPackId(view.assessment.packId);

    const baseline = computeDaylightViolationMinutes({
      countryCode,
      profile: view.profile,
      dailyDrivePlans: view.dailyDrivePlans,
      activityArrivals: view.worldStateEvidence?.activityArrivals,
    });

    const slipArrivals = buildExecutionSlipDaylightArrivals({
      dailyDrivePlans: view.dailyDrivePlans,
      dayIndex: resolvedDayIndex,
      slipMinutes: input.impact.assessment.slipMinutes,
      nextActivityId: input.impact.nextActivityId,
      projectedEta: input.impact.assessment.projectedEta,
    });

    const mergedArrivals = [
      ...(view.worldStateEvidence?.activityArrivals ?? []),
      ...slipArrivals,
    ];

    const adjusted = computeDaylightViolationMinutes({
      countryCode,
      profile: view.profile,
      dailyDrivePlans: view.dailyDrivePlans,
      activityArrivals: mergedArrivals,
    });

    if (
      adjusted.driveMinutesAfterCivilDusk <= 0 &&
      adjusted.activityMinutesAfterSunset <= 0
    ) {
      return null;
    }

    if (
      adjusted.driveMinutesAfterCivilDusk <= baseline.driveMinutesAfterCivilDusk &&
      adjusted.activityMinutesAfterSunset <= baseline.activityMinutesAfterSunset
    ) {
      return null;
    }

    const result = await this.pipelineBridge.tryTriggerFromDaylightScheduleRisk({
      tripId: input.tripId,
      triggerEventId: input.triggerEventId,
      worldStateSnapshotId: input.worldStateSnapshotId,
      driveMinutesAfterCivilDusk: adjusted.driveMinutesAfterCivilDusk,
      activityMinutesAfterSunset: adjusted.activityMinutesAfterSunset,
      previousDriveMinutesAfterCivilDusk: baseline.driveMinutesAfterCivilDusk,
      previousActivityMinutesAfterSunset: baseline.activityMinutesAfterSunset,
    });

    if (result) {
      this.logger.debug(
        `TEP slip→daylight trip=${input.tripId} slip=${input.impact.assessment.slipMinutes}min ` +
          `driveAfterDusk=${adjusted.driveMinutesAfterCivilDusk} hook=${result.hook?.hookId ?? 'none'}`,
      );
    }

    return result;
  }
}
