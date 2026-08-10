/**
 * Certification harness for Iceland FuelAssessment scenarios.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { assessIcelandFuel } from './assess-iceland-fuel';
import { loadIcelandFuelPolicy, loadIcelandFuelStationProfiles } from './iceland-fuel.loader';
import type {
  FuelAssessment,
  IcelandFuelAssessmentInput,
  IcelandFuelStationProfile,
} from './iceland-fuel.types';

export interface FuelCertStationRef {
  poiId: string;
  distanceKm: number;
  unavailable?: boolean;
  profileOverrides?: Partial<IcelandFuelStationProfile>;
}

export interface FuelCertScenario {
  scenarioId: string;
  description?: string;
  input: {
    estimatedRangeKm: number;
    fuelTypeNeeded: IcelandFuelAssessmentInput['fuelTypeNeeded'];
    stationsAhead: FuelCertStationRef[];
    weatherBand?: IcelandFuelAssessmentInput['weatherBand'];
    roadBand?: IcelandFuelAssessmentInput['roadBand'];
    detourExtraKm?: number;
    corridorRemoteness?: IcelandFuelAssessmentInput['corridorRemoteness'];
  };
  expect: {
    status: FuelAssessment['status'];
    nextPrimaryStation?: string;
    recommendedAction?: FuelAssessment['recommendedAction'];
    reasonsInclude?: string[];
    assumptionsInclude?: string;
    minReserveKm?: number;
    minRequiredRangeKm?: number;
  };
}

export interface FuelCertBundle {
  schemaId: string;
  country: string;
  version: string;
  scenarios: FuelCertScenario[];
}

export interface FuelCertCaseResult {
  scenarioId: string;
  passed: boolean;
  expected: FuelCertScenario['expect'];
  actual?: FuelAssessment;
  message?: string;
}

export function loadFuelAssessmentCertScenarios(
  cwd: string = process.cwd(),
): FuelCertBundle {
  const path = join(
    cwd,
    'data/destination-packs/is/certification/knowledge-pack/fuel/fuel-assessment.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as FuelCertBundle;
}

export function buildAssessmentInputFromCertScenario(
  scenario: FuelCertScenario,
  cwd: string = process.cwd(),
): IcelandFuelAssessmentInput {
  const bundle = loadIcelandFuelStationProfiles(cwd);
  const byId = new Map(bundle.stations.map((s) => [s.poiId, s]));

  const stationsAhead = scenario.input.stationsAhead.map((ref) => {
    const base = byId.get(ref.poiId);
    if (!base) {
      throw new Error(`Unknown fuel station poiId in cert: ${ref.poiId}`);
    }
    const profile: IcelandFuelStationProfile = {
      ...base,
      ...ref.profileOverrides,
      unavailable: ref.unavailable ?? base.unavailable,
      poiId: base.poiId,
      fuelTypes: ref.profileOverrides?.fuelTypes ?? base.fuelTypes,
      sourceRefs: base.sourceRefs,
    };
    return { profile, distanceKm: ref.distanceKm };
  });

  return {
    estimatedRangeKm: scenario.input.estimatedRangeKm,
    fuelTypeNeeded: scenario.input.fuelTypeNeeded,
    stationsAhead,
    weatherBand: scenario.input.weatherBand,
    roadBand: scenario.input.roadBand,
    detourExtraKm: scenario.input.detourExtraKm,
    corridorRemoteness: scenario.input.corridorRemoteness,
  };
}

function matchExpect(
  actual: FuelAssessment,
  expect: FuelCertScenario['expect'],
): { passed: boolean; message?: string } {
  if (actual.status !== expect.status) {
    return {
      passed: false,
      message: `status expected ${expect.status}, got ${actual.status}`,
    };
  }
  if (
    expect.nextPrimaryStation &&
    actual.nextPrimaryStation !== expect.nextPrimaryStation
  ) {
    return {
      passed: false,
      message: `nextPrimaryStation expected ${expect.nextPrimaryStation}, got ${actual.nextPrimaryStation}`,
    };
  }
  if (
    expect.recommendedAction &&
    actual.recommendedAction !== expect.recommendedAction
  ) {
    return {
      passed: false,
      message: `recommendedAction expected ${expect.recommendedAction}, got ${actual.recommendedAction}`,
    };
  }
  for (const reason of expect.reasonsInclude ?? []) {
    if (!actual.reasons.includes(reason)) {
      return {
        passed: false,
        message: `missing reason ${reason}; got ${actual.reasons.join(',')}`,
      };
    }
  }
  if (
    expect.assumptionsInclude &&
    !actual.assumptions.some((a) => a.includes(expect.assumptionsInclude!))
  ) {
    return {
      passed: false,
      message: `missing assumption ${expect.assumptionsInclude}`,
    };
  }
  if (
    typeof expect.minReserveKm === 'number' &&
    actual.reserveRangeKm < expect.minReserveKm
  ) {
    return {
      passed: false,
      message: `reserveRangeKm ${actual.reserveRangeKm} < ${expect.minReserveKm}`,
    };
  }
  if (
    typeof expect.minRequiredRangeKm === 'number' &&
    actual.requiredRangeKm < expect.minRequiredRangeKm
  ) {
    return {
      passed: false,
      message: `requiredRangeKm ${actual.requiredRangeKm} < ${expect.minRequiredRangeKm}`,
    };
  }
  return { passed: true };
}

export function runFuelAssessmentCertification(
  cwd: string = process.cwd(),
): {
  schemaId: 'tripnara.iceland.fuel_assessment.cert.report@v1';
  total: number;
  passed: number;
  failed: number;
  results: FuelCertCaseResult[];
} {
  const bundle = loadFuelAssessmentCertScenarios(cwd);
  const policy = loadIcelandFuelPolicy(cwd);
  const results: FuelCertCaseResult[] = bundle.scenarios.map((scenario) => {
    const input = buildAssessmentInputFromCertScenario(scenario, cwd);
    const actual = assessIcelandFuel(input, policy);
    const { passed, message } = matchExpect(actual, scenario.expect);
    return {
      scenarioId: scenario.scenarioId,
      passed,
      expected: scenario.expect,
      actual,
      message,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    schemaId: 'tripnara.iceland.fuel_assessment.cert.report@v1',
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
