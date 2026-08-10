/**
 * Competition demo / cross-domain replay harness.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { buildAssessmentInputFromCertScenario } from '../fuel/fuel-certification.harness';
import type { FuelCertScenario } from '../fuel/fuel-certification.harness';
import type { IcelandFuelAssessmentInput } from '../fuel/iceland-fuel.types';
import { evaluateIcelandSelfDriveSituation } from './evaluate-iceland-self-drive-situation';
import { projectIcelandSelfDriveSituationClient } from './iceland-self-drive-situation.client';
import type {
  IcelandSelfDriveSituationInput,
  IcelandSelfDriveSituationResult,
} from './iceland-self-drive-situation.types';
import type {
  InsuranceCoverageTier,
  RouteExposureInput,
} from '../rental-insurance';

interface DemoFuelStationRef {
  poiId: string;
  distanceKm: number;
  unavailable?: boolean;
  profileOverrides?: Record<string, unknown>;
}

export interface DemoReplayScenario {
  scenarioId: string;
  title: string;
  narrative: string[];
  input: {
    tripId?: string;
    executeFuelRunbookOnBlock?: boolean;
    userSafeStopped?: boolean;
    runbookEventType?: string;
    runbookContextExtras?: Record<string, unknown>;
    vehicleRoadFit?: IcelandSelfDriveSituationInput['vehicleRoadFit'];
    weather?: IcelandSelfDriveSituationInput['weather'];
    daylight?: IcelandSelfDriveSituationInput['daylight'];
    winter?: IcelandSelfDriveSituationInput['winter'];
    insurance?: {
      exposure: RouteExposureInput;
      coverageTier?: InsuranceCoverageTier;
    };
    fuel?: {
      estimatedRangeKm: number;
      fuelTypeNeeded: IcelandFuelAssessmentInput['fuelTypeNeeded'];
      stationsAhead: DemoFuelStationRef[];
      weatherBand?: IcelandFuelAssessmentInput['weatherBand'];
      roadBand?: IcelandFuelAssessmentInput['roadBand'];
      corridorRemoteness?: IcelandFuelAssessmentInput['corridorRemoteness'];
      detourExtraKm?: number;
    };
  };
  expect: {
    verdictGateIn?: Array<'ALLOW' | 'NEED_CONFIRM' | 'REPLAN_REQUIRED' | 'BLOCK'>;
    aggregateNot?: string[];
    runbookId?: string;
    runbookVerified?: boolean;
    createPlanVersion?: boolean;
    weatherDelayIsRange?: boolean;
    reasonsIncludeAny?: string[];
    /** Daylight assessor stack */
    daylightFullLoadStack?: boolean;
    daylightGateIn?: Array<'ALLOW' | 'NEED_CONFIRM' | 'REPLAN_REQUIRED' | 'BLOCK'>;
    plowServiceBand?: string;
    /** iOS client projection checks */
    clientHasDaylight?: boolean;
    clientHasRoadPlow?: boolean;
    clientHasAttractionAccess?: boolean;
    clientAttractionStatus?: string;
    clientHasLodging?: boolean;
    clientLodgingHoursUnknown?: boolean;
    clientHasInsurance?: boolean;
    clientInsuranceHasGap?: boolean;
    clientInsuranceHasHardGap?: boolean;
    clientInsuranceFordingExcluded?: boolean;
    clientDeepLinkSemanticKey?: string;
    clientWeatherCausalChainMin?: number;
    clientPlowDelayIsRange?: boolean;
    clientActionsIncludeAny?: string[];
  };
}

export interface DemoReplayBundle {
  schemaId: string;
  country: string;
  version: string;
  title: string;
  scenarios: DemoReplayScenario[];
}

function resolveFuelInput(
  fuel: NonNullable<DemoReplayScenario['input']['fuel']>,
  cwd: string,
): IcelandFuelAssessmentInput {
  const fakeScenario: FuelCertScenario = {
    scenarioId: 'demo_fuel_resolve',
    input: {
      estimatedRangeKm: fuel.estimatedRangeKm,
      fuelTypeNeeded: fuel.fuelTypeNeeded,
      stationsAhead: fuel.stationsAhead,
      weatherBand: fuel.weatherBand,
      roadBand: fuel.roadBand,
      corridorRemoteness: fuel.corridorRemoteness,
      detourExtraKm: fuel.detourExtraKm,
    },
    expect: { status: 'PASS' },
  };
  return buildAssessmentInputFromCertScenario(fakeScenario, cwd);
}

export function loadDemoReplayScenarios(cwd = process.cwd()): DemoReplayBundle {
  const path = join(
    cwd,
    'data/destination-packs/is/certification/knowledge-pack/cross-domain/demo-replay.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as DemoReplayBundle;
}

export function runDemoReplayScenario(
  scenario: DemoReplayScenario,
  cwd = process.cwd(),
): IcelandSelfDriveSituationResult {
  const fuel = scenario.input.fuel
    ? resolveFuelInput(scenario.input.fuel, cwd)
    : undefined;

  return evaluateIcelandSelfDriveSituation({
    tripId: scenario.input.tripId,
    scenarioId: scenario.scenarioId,
    vehicleRoadFit: scenario.input.vehicleRoadFit,
    weather: scenario.input.weather,
    daylight: scenario.input.daylight,
    winter: scenario.input.winter,
    fuel,
    executeFuelRunbookOnBlock: scenario.input.executeFuelRunbookOnBlock,
    userSafeStopped: scenario.input.userSafeStopped,
    runbookEventType: scenario.input.runbookEventType,
    runbookContextExtras: scenario.input.runbookContextExtras,
  });
}

function matchExpect(
  scenario: DemoReplayScenario,
  actual: IcelandSelfDriveSituationResult,
): { passed: boolean; message?: string } {
  const e = scenario.expect;
  const problems: string[] = [];

  if (e.verdictGateIn && !e.verdictGateIn.includes(actual.verdict.gate)) {
    problems.push(
      `verdict ${actual.verdict.gate} not in ${e.verdictGateIn.join('|')}`,
    );
  }
  for (const banned of e.aggregateNot ?? []) {
    if (actual.aggregate.status === banned) {
      problems.push(`aggregate unexpectedly ${banned}`);
    }
  }
  if (e.runbookId && actual.runbook?.runbookId !== e.runbookId) {
    problems.push(
      `runbook expected ${e.runbookId}, got ${actual.runbook?.runbookId}`,
    );
  }
  if (e.runbookVerified != null) {
    if (!actual.runbook || actual.runbook.verifiedProposal !== e.runbookVerified) {
      problems.push('runbookVerified mismatch');
    }
  }
  if (e.createPlanVersion != null && actual.runbook?.createPlanVersion !== e.createPlanVersion) {
    problems.push('createPlanVersion mismatch');
  }
  if (e.weatherDelayIsRange) {
    const range = actual.weatherImpact?.impacts.drivingSpeed?.estimatedDelayRangeMin;
    if (!range || range[0] > range[1]) problems.push('weather delay not a range');
  }
  if (e.reasonsIncludeAny?.length) {
    const hit = e.reasonsIncludeAny.some((r) => actual.aggregate.reasons.includes(r));
    if (!hit) {
      problems.push(
        `none of reasons ${e.reasonsIncludeAny.join('|')}; got ${actual.aggregate.reasons.join(',')}`,
      );
    }
  }
  if (e.daylightFullLoadStack != null) {
    if (actual.daylightLoad?.stack.fullLoadStack !== e.daylightFullLoadStack) {
      problems.push(
        `daylightFullLoadStack expected ${e.daylightFullLoadStack}, got ${actual.daylightLoad?.stack.fullLoadStack}`,
      );
    }
  }
  if (e.daylightGateIn?.length) {
    const g = actual.daylightLoad?.gate;
    if (!g || !e.daylightGateIn.includes(g)) {
      problems.push(`daylight gate ${g} not in ${e.daylightGateIn.join('|')}`);
    }
  }
  if (e.plowServiceBand) {
    const band = actual.winter?.snowPlow?.plowServiceBand;
    if (band !== e.plowServiceBand) {
      problems.push(`plowServiceBand expected ${e.plowServiceBand}, got ${band}`);
    }
  }

  const needsClient =
    e.clientHasDaylight != null ||
    e.clientHasRoadPlow != null ||
    e.clientHasAttractionAccess != null ||
    e.clientAttractionStatus != null ||
    e.clientHasLodging != null ||
    e.clientLodgingHoursUnknown != null ||
    e.clientHasInsurance != null ||
    e.clientInsuranceHasGap != null ||
    e.clientInsuranceHasHardGap != null ||
    e.clientInsuranceFordingExcluded != null ||
    e.clientDeepLinkSemanticKey != null ||
    e.clientWeatherCausalChainMin != null ||
    e.clientPlowDelayIsRange != null ||
    (e.clientActionsIncludeAny?.length ?? 0) > 0;

  if (needsClient) {
    const client = projectIcelandSelfDriveSituationClient(actual, {
      tripId: scenario.input.tripId,
      insurance: scenario.input.insurance,
    });
    if (e.clientHasDaylight === true && !client.daylight) {
      problems.push('client missing daylight');
    }
    if (e.clientHasRoadPlow === true && !client.road?.plowServiceBand) {
      problems.push('client missing road.plow*');
    }
    if (e.clientHasAttractionAccess === true && !client.attractionAccess) {
      problems.push('client missing attractionAccess');
    }
    if (e.clientHasLodging === true && !client.lodging) {
      problems.push('client missing lodging');
    }
    if (e.clientHasInsurance === true && !client.insurance) {
      problems.push('client missing insurance');
    }
    if (
      e.clientInsuranceHasGap != null &&
      client.insurance?.hasGap !== e.clientInsuranceHasGap
    ) {
      problems.push(
        `client insurance.hasGap expected ${e.clientInsuranceHasGap}, got ${client.insurance?.hasGap}`,
      );
    }
    if (
      e.clientInsuranceHasHardGap != null &&
      client.insurance?.hasHardGap !== e.clientInsuranceHasHardGap
    ) {
      problems.push(
        `client insurance.hasHardGap expected ${e.clientInsuranceHasHardGap}, got ${client.insurance?.hasHardGap}`,
      );
    }
    if (
      e.clientInsuranceFordingExcluded === true &&
      client.insurance?.fordingExcluded !== true
    ) {
      problems.push('client insurance.fordingExcluded missing');
    }
    if (
      e.clientDeepLinkSemanticKey &&
      client.deepLink?.semanticKeyHint !== e.clientDeepLinkSemanticKey
    ) {
      problems.push(
        `client deepLink semantic expected ${e.clientDeepLinkSemanticKey}, got ${client.deepLink?.semanticKeyHint}`,
      );
    }
    if (
      e.clientLodgingHoursUnknown != null &&
      client.lodging?.hoursUnknown !== e.clientLodgingHoursUnknown
    ) {
      problems.push(
        `client lodging.hoursUnknown expected ${e.clientLodgingHoursUnknown}, got ${client.lodging?.hoursUnknown}`,
      );
    }
    if (
      e.clientAttractionStatus &&
      client.attractionAccess?.status !== e.clientAttractionStatus
    ) {
      problems.push(
        `client attraction status expected ${e.clientAttractionStatus}, got ${client.attractionAccess?.status}`,
      );
    }
    if (e.clientWeatherCausalChainMin != null) {
      const n = client.weather?.causalChain?.length ?? 0;
      if (n < e.clientWeatherCausalChainMin) {
        problems.push(
          `client causalChain length ${n} < ${e.clientWeatherCausalChainMin}`,
        );
      }
    }
    if (e.clientPlowDelayIsRange) {
      const r = client.road?.plowDelayRangeMin;
      if (!r || r.length !== 2 || r[0]! > r[1]!) {
        problems.push('client plowDelayRangeMin not a [lo,hi] range');
      }
    }
    if (e.clientActionsIncludeAny?.length) {
      const actions = [
        ...client.primaryActions,
        ...(client.daylight?.recommendedActions ?? []),
        ...(client.road?.recommendedActions ?? []),
        ...(client.attractionAccess?.recommendedActions ?? []),
        ...(client.activityRisk?.recommendedActions ?? []),
        ...(client.lodging?.recommendedActions ?? []),
        ...(client.insurance?.recommendedActions ?? []),
      ];
      const hit = e.clientActionsIncludeAny.some((a) => actions.includes(a));
      if (!hit) {
        problems.push(
          `client actions missing any of ${e.clientActionsIncludeAny.join('|')}`,
        );
      }
    }
  }

  return {
    passed: problems.length === 0,
    message: problems.length ? problems.join('; ') : undefined,
  };
}

export function runIcelandSelfDriveDemoCertification(cwd = process.cwd()): {
  schemaId: 'tripnara.iceland.self_drive_demo.cert.report@v1';
  title: string;
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    scenarioId: string;
    title: string;
    passed: boolean;
    verdict?: string;
    runbookId?: string;
    message?: string;
    narrative: string[];
  }>;
} {
  const bundle = loadDemoReplayScenarios(cwd);
  const results = bundle.scenarios.map((scenario) => {
    const actual = runDemoReplayScenario(scenario, cwd);
    const { passed, message } = matchExpect(scenario, actual);
    return {
      scenarioId: scenario.scenarioId,
      title: scenario.title,
      passed,
      verdict: actual.verdict.gate,
      runbookId: actual.runbook?.runbookId,
      message,
      narrative: scenario.narrative,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    schemaId: 'tripnara.iceland.self_drive_demo.cert.report@v1',
    title: bundle.title,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
