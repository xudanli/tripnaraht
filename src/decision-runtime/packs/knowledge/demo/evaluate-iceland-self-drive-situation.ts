/**
 * Single consumer entry: VehicleRoadFit + Weather + Fuel + Daylight → aggregate → optional runbook.
 */

import { assessIcelandFuel } from '../fuel/assess-iceland-fuel';
import { loadIcelandFuelPolicy } from '../fuel/iceland-fuel.loader';
import { aggregateIcelandSelfDriveDomains } from '../road-weather/aggregate-cross-domain';
import { assessDaylightDrivingLoad } from '../road-weather/assess-daylight-driving-load';
import { assessDrivingWeatherImpact } from '../road-weather/assess-driving-weather-impact';
import { assessVehicleRoadFit } from '../road-weather/assess-vehicle-road-fit';
import { assessIcelandWinterKnowledge } from '../winter/assess-iceland-winter-knowledge';
import { executeIcelandDriveRunbookForEvent } from '../runbooks/iceland-drive-runbook.executor';
import { executeIcelandFuelInsufficientRunbook } from '../runbooks/fuel-runbook.bridge';
import type {
  IcelandSelfDriveSituationInput,
  IcelandSelfDriveSituationResult,
} from './iceland-self-drive-situation.types';

function buildVerdict(
  aggregate: IcelandSelfDriveSituationResult['aggregate'],
  runbook?: IcelandSelfDriveSituationResult['runbook'],
): IcelandSelfDriveSituationResult['verdict'] {
  const primaryActions = [...aggregate.recommendedActions];
  if (runbook?.verifiedProposal) {
    primaryActions.push(`RUNBOOK_${runbook.runbookId}`);
    if (runbook.createPlanVersion) {
      primaryActions.push('PREPARE_PLAN_VERSION');
    }
  }

  const summaryParts = [
    `aggregate=${aggregate.status}`,
    ...aggregate.reasons.slice(0, 4),
  ];
  if (runbook) {
    summaryParts.push(`runbook=${runbook.runbookId}:verified=${runbook.verifiedProposal}`);
  }

  return {
    gate: aggregate.status,
    summary: summaryParts.join('; '),
    primaryActions: [...new Set(primaryActions)],
  };
}

export function evaluateIcelandSelfDriveSituation(
  input: IcelandSelfDriveSituationInput,
): IcelandSelfDriveSituationResult {
  const vehicleRoadFit = input.vehicleRoadFit
    ? assessVehicleRoadFit(input.vehicleRoadFit)
    : undefined;
  const weatherImpact = input.weather
    ? assessDrivingWeatherImpact(input.weather)
    : undefined;
  const fuelAssessment = input.fuel
    ? assessIcelandFuel(input.fuel, loadIcelandFuelPolicy())
    : undefined;

  const weatherBand =
    input.weather?.phenomenon === 'GUST' ||
    (input.weather?.additionalPhenomena?.length ?? 0) > 0 ||
    input.vehicleRoadFit?.weatherBand === 'severe' ||
    input.vehicleRoadFit?.weatherBand === 'extreme'
      ? (input.vehicleRoadFit?.weatherBand === 'extreme' ? 'extreme' : 'severe')
      : 'default';

  const daylightLoad = input.daylight
    ? assessDaylightDrivingLoad({
        ...input.daylight,
        weatherBand: input.daylight.weatherBand ?? weatherBand,
        unfamiliarRoad:
          input.daylight.unfamiliarRoad ??
          (input.vehicleRoadFit?.roadBaseType === 'F_ROAD' ||
            input.vehicleRoadFit?.driverExperience === 'NONE' ||
            input.vehicleRoadFit?.driverExperience === 'BASIC' ||
            input.daylight.nightExposureMinutes > 0),
      })
    : undefined;

  const winter = input.winter
    ? assessIcelandWinterKnowledge(input.winter)
    : undefined;

  const aggregate = aggregateIcelandSelfDriveDomains({
    vehicleRoadFit,
    weatherImpact,
    fuelStatus: fuelAssessment?.status,
    fuelReliabilityUnknown: fuelAssessment?.reasons.some((r) =>
      r.includes('UNKNOWN'),
    ),
    daylightLoad,
    winter,
  });

  let runbook = undefined as IcelandSelfDriveSituationResult['runbook'];

  if (
    fuelAssessment &&
    fuelAssessment.status === 'BLOCK' &&
    input.executeFuelRunbookOnBlock !== false
  ) {
    runbook = executeIcelandFuelInsufficientRunbook({
      assessment: fuelAssessment,
      userSafeStopped: input.userSafeStopped,
    });
  } else if (input.runbookEventType) {
    runbook = executeIcelandDriveRunbookForEvent({
      eventType: input.runbookEventType,
      userSafeStopped: input.userSafeStopped,
      ...(input.runbookContextExtras as object),
    } as Parameters<typeof executeIcelandDriveRunbookForEvent>[0]);
  } else if (aggregate.status === 'BLOCK' && vehicleRoadFit?.gate === 'REJECT') {
    runbook = executeIcelandDriveRunbookForEvent({
      eventType: 'ROAD_CLOSURE',
      userSafeStopped: input.userSafeStopped,
      roadSegmentId: vehicleRoadFit.roadSegmentId,
      roadStatus: vehicleRoadFit.roadStatus === 'CLOSED' ? 'CLOSED' : 'UNKNOWN',
      proposedOperations: ['REROUTE', 'END_DAY_EARLY'],
    });
  } else if (
    aggregate.status === 'REPLAN_REQUIRED' ||
    weatherImpact?.impacts.routeSafety?.status === 'BLOCK'
  ) {
    runbook = executeIcelandDriveRunbookForEvent({
      eventType: 'STRONG_WIND',
      userSafeStopped: input.userSafeStopped,
      windGustMs: input.weather?.windGustMs,
      vehicleClass: input.weather?.vehicleClass ?? input.vehicleRoadFit?.vehicleClass,
      roadExposure: input.weather?.roadExposure ?? 'HIGH',
      estimatedDelayMinRange:
        weatherImpact?.impacts.drivingSpeed?.estimatedDelayRangeMin ?? [25, 45],
      proposedOperations: ['SHORTEN', 'REROUTE', 'END_DAY_EARLY'],
    });
  }

  return {
    schemaId: 'tripnara.iceland.self_drive_situation@v1',
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    vehicleRoadFit,
    weatherImpact,
    fuelAssessment,
    daylightLoad,
    winter,
    aggregate,
    runbook,
    verdict: buildVerdict(aggregate, runbook),
  };
}
