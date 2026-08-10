/**
 * Build + attach Iceland Self-Drive Situation onto TripWorldState (live Decision Engine path).
 * Inputs come from structured route facts / overlay / pack profiles — never free-text scrape.
 */

import type { TripPlan } from '../../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../../trips/decision/world-model';
import { assessIcelandFuel } from '../fuel/assess-iceland-fuel';
import { loadIcelandFuelPolicy } from '../fuel/iceland-fuel.loader';
import type { FuelAssessment, IcelandFuelAssessmentInput } from '../fuel/iceland-fuel.types';
import { aggregateIcelandSelfDriveDomains } from '../road-weather/aggregate-cross-domain';
import { executeIcelandFuelInsufficientRunbook } from '../runbooks/fuel-runbook.bridge';
import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';
import type { IcelandSelfDriveSituationResult } from './iceland-self-drive-situation.types';
import { resolveIcelandSelfDriveFacts } from './resolve-iceland-self-drive-facts';

function rebuildVerdict(
  aggregate: IcelandSelfDriveSituationResult['aggregate'],
  runbook?: IcelandSelfDriveSituationResult['runbook'],
): IcelandSelfDriveSituationResult['verdict'] {
  const primaryActions = [...aggregate.recommendedActions];
  if (runbook?.verifiedProposal) {
    primaryActions.push(`RUNBOOK_${runbook.runbookId}`);
    if (runbook.createPlanVersion) primaryActions.push('PREPARE_PLAN_VERSION');
  }
  return {
    gate: aggregate.status,
    summary: [`aggregate=${aggregate.status}`, ...aggregate.reasons.slice(0, 4)].join('; '),
    primaryActions: [...new Set(primaryActions)],
  };
}

/**
 * Fuel input when corridor assessment is absent: use reachability numbers only.
 * Never invent station profiles for the corridor.
 */
function fuelInputFromReachability(
  state: TripWorldState,
  weatherBand: IcelandFuelAssessmentInput['weatherBand'],
): IcelandFuelAssessmentInput | undefined {
  const legs = Object.values(state.signals.fuelReachabilityByLegId ?? {});
  const critical = legs.find((l) => l && l.safeBeforeNextFuel === false);
  if (!critical) return undefined;
  return {
    estimatedRangeKm: Math.max(0, critical.remainingRangeKm),
    fuelTypeNeeded: 'PETROL',
    stationsAhead: [],
    plannedSegmentKm: Number.isFinite(critical.kmToNextFuel)
      ? critical.kmToNextFuel
      : undefined,
    weatherBand,
  };
}

/**
 * Situation from live trip state. Returns undefined when not Iceland.
 */
export function buildIcelandSelfDriveSituationFromTripState(opts: {
  state: TripWorldState;
  plan: TripPlan;
  corridorFuelAssessment?: FuelAssessment;
}): IcelandSelfDriveSituationResult | undefined {
  const facts = resolveIcelandSelfDriveFacts({
    state: opts.state,
    plan: opts.plan,
  });
  if (!facts) return undefined;

  const fuelInput = opts.corridorFuelAssessment
    ? undefined
    : fuelInputFromReachability(
        opts.state,
        facts.vehicleRoadFit.weatherBand === 'severe' ? 'severe' : 'default',
      );

  const evaluated = evaluateIcelandSelfDriveSituation({
    tripId: opts.state.context.tripId,
    scenarioId: 'LIVE_TRIP_HYDRATE',
    vehicleRoadFit: facts.vehicleRoadFit,
    weather: facts.weather,
    daylight: facts.daylight,
    winter: facts.winter,
    fuel: fuelInput,
    executeFuelRunbookOnBlock: true,
    userSafeStopped: true,
  });

  if (!opts.corridorFuelAssessment) {
    return evaluated;
  }

  const fuelAssessment =
    opts.corridorFuelAssessment.status
      ? opts.corridorFuelAssessment
      : assessIcelandFuel(
          {
            estimatedRangeKm: opts.corridorFuelAssessment.estimatedRangeKm,
            fuelTypeNeeded: 'PETROL',
            stationsAhead: [],
          },
          loadIcelandFuelPolicy(),
        );

  const aggregate = aggregateIcelandSelfDriveDomains({
    vehicleRoadFit: evaluated.vehicleRoadFit,
    weatherImpact: evaluated.weatherImpact,
    fuelStatus: fuelAssessment.status,
    fuelReliabilityUnknown: fuelAssessment.reasons.some((r) => r.includes('UNKNOWN')),
    daylightLoad: evaluated.daylightLoad,
    winter: evaluated.winter,
  });

  const runbook =
    fuelAssessment.status === 'BLOCK'
      ? executeIcelandFuelInsufficientRunbook({
          assessment: fuelAssessment,
          userSafeStopped: true,
        })
      : evaluated.runbook;

  return {
    ...evaluated,
    fuelAssessment,
    aggregate,
    runbook,
    verdict: rebuildVerdict(aggregate, runbook),
  };
}

export function attachIcelandSelfDriveSituationToState(
  state: TripWorldState,
  plan: TripPlan,
  corridorFuelAssessment?: FuelAssessment,
): IcelandSelfDriveSituationResult | undefined {
  const result = buildIcelandSelfDriveSituationFromTripState({
    state,
    plan,
    corridorFuelAssessment,
  });
  if (result) {
    state.signals.icelandSelfDriveSituation = result;
  } else {
    delete state.signals.icelandSelfDriveSituation;
  }
  return result;
}
