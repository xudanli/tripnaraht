import { readFileSync } from 'fs';
import { join } from 'path';
import { aggregateIcelandSelfDriveDomains } from './aggregate-cross-domain';
import { assessDrivingWeatherImpact } from './assess-driving-weather-impact';
import { assessVehicleRoadFit } from './assess-vehicle-road-fit';
import type {
  CrossDomainAggregateStatus,
  DrivingWeatherImpactInput,
  VehicleRoadFitInput,
} from './iceland-road-weather.types';

interface CertBundle {
  vehicleRoadFit: Array<{
    scenarioId: string;
    input: VehicleRoadFitInput;
    expect: {
      status: string;
      gate: string;
      violatedRulesInclude?: string[];
    };
  }>;
  weatherDriving: Array<{
    scenarioId: string;
    input: DrivingWeatherImpactInput;
    expect: {
      speedLevel?: string;
      delayIsRange?: boolean;
      minDelayLo?: number;
      routeSafety?: string;
      routeSafetyIn?: string[];
      fatigueDelta?: string;
      visibility?: string;
    };
  }>;
  crossDomain: Array<{
    scenarioId: string;
    vehicleRoadFit?: VehicleRoadFitInput;
    weather?: DrivingWeatherImpactInput;
    fuelStatus?: 'PASS' | 'WARN' | 'BLOCK';
    fuelReliabilityUnknown?: boolean;
    expect: {
      status: CrossDomainAggregateStatus;
      reasonsInclude?: string[];
    };
  }>;
}

export function loadRoadWeatherCertBundle(cwd = process.cwd()): CertBundle {
  const path = join(
    cwd,
    'data/destination-packs/is/certification/knowledge-pack/vehicle-road-fit/road-weather.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as CertBundle;
}

export function runRoadWeatherCertification(cwd = process.cwd()): {
  total: number;
  passed: number;
  failed: number;
  results: Array<{ scenarioId: string; passed: boolean; message?: string }>;
} {
  const bundle = loadRoadWeatherCertBundle(cwd);
  const results: Array<{ scenarioId: string; passed: boolean; message?: string }> =
    [];

  for (const s of bundle.vehicleRoadFit) {
    const actual = assessVehicleRoadFit(s.input);
    const problems: string[] = [];
    if (actual.status !== s.expect.status) {
      problems.push(`status ${actual.status}!=${s.expect.status}`);
    }
    if (actual.gate !== s.expect.gate) {
      problems.push(`gate ${actual.gate}!=${s.expect.gate}`);
    }
    for (const r of s.expect.violatedRulesInclude ?? []) {
      if (!actual.violatedRules.includes(r)) problems.push(`missing rule ${r}`);
    }
    results.push({
      scenarioId: s.scenarioId,
      passed: problems.length === 0,
      message: problems.join('; ') || undefined,
    });
  }

  for (const s of bundle.weatherDriving) {
    const actual = assessDrivingWeatherImpact(s.input);
    const problems: string[] = [];
    if (s.expect.speedLevel && actual.impacts.drivingSpeed?.level !== s.expect.speedLevel) {
      problems.push('speedLevel mismatch');
    }
    if (s.expect.delayIsRange) {
      const range = actual.impacts.drivingSpeed?.estimatedDelayRangeMin;
      if (!range || range[0] > range[1]) problems.push('delay range invalid');
      if (s.expect.minDelayLo != null && range && range[0] < s.expect.minDelayLo) {
        problems.push(`delay lo ${range[0]} < ${s.expect.minDelayLo}`);
      }
    }
    if (s.expect.routeSafety && actual.impacts.routeSafety?.status !== s.expect.routeSafety) {
      problems.push('routeSafety mismatch');
    }
    if (
      s.expect.routeSafetyIn &&
      !s.expect.routeSafetyIn.includes(actual.impacts.routeSafety?.status ?? '')
    ) {
      problems.push('routeSafety not in allowed set');
    }
    if (s.expect.fatigueDelta && actual.impacts.fatigue?.delta !== s.expect.fatigueDelta) {
      problems.push('fatigue mismatch');
    }
    if (s.expect.visibility && actual.impacts.visibility?.status !== s.expect.visibility) {
      problems.push('visibility mismatch');
    }
    results.push({
      scenarioId: s.scenarioId,
      passed: problems.length === 0,
      message: problems.join('; ') || undefined,
    });
  }

  for (const s of bundle.crossDomain) {
    const actual = aggregateIcelandSelfDriveDomains({
      vehicleRoadFit: s.vehicleRoadFit
        ? assessVehicleRoadFit(s.vehicleRoadFit)
        : undefined,
      weatherImpact: s.weather
        ? assessDrivingWeatherImpact(s.weather)
        : undefined,
      fuelStatus: s.fuelStatus,
      fuelReliabilityUnknown: s.fuelReliabilityUnknown,
    });
    const problems: string[] = [];
    if (actual.status !== s.expect.status) {
      problems.push(`aggregate ${actual.status}!=${s.expect.status}`);
    }
    for (const r of s.expect.reasonsInclude ?? []) {
      if (!actual.reasons.includes(r)) problems.push(`missing reason ${r}`);
    }
    results.push({
      scenarioId: s.scenarioId,
      passed: problems.length === 0,
      message: problems.join('; ') || undefined,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
