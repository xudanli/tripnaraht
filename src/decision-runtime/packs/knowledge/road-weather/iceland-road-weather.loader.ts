import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type {
  DaylightDrivingPolicy,
  IcelandVehicleRoadMatrix,
  RegulationNormItem,
} from './iceland-road-weather.types';

const IS_PACK = 'data/destination-packs/is';

function readJson<T>(abs: string): T {
  if (!existsSync(abs)) throw new Error(`Missing road-weather asset: ${abs}`);
  return JSON.parse(readFileSync(abs, 'utf8')) as T;
}

export function loadIcelandVehicleRoadMatrix(
  cwd: string = process.cwd(),
): IcelandVehicleRoadMatrix {
  return readJson(
    join(cwd, IS_PACK, 'knowledge/vehicle-road-fit/is-vehicle-road-matrix.json'),
  );
}

export interface WeatherDrivingPolicyFile {
  schemaId: string;
  version: string;
  status: string;
  phenomena: Record<
    string,
    {
      gustThresholdMs?: number;
      visibilityThresholdM?: number;
      speedLevel: 'NONE' | 'MODERATE' | 'SEVERE';
      delayRangeMin: [number, number];
      fatigueDelta: 'LOW' | 'MEDIUM' | 'HIGH';
      visibility?: 'NORMAL' | 'REDUCED' | 'CRITICAL';
      routeSafety: 'PASS' | 'WARN' | 'BLOCK';
    }
  >;
  vehicleRiskMultipliers: Record<string, number>;
  exposureDelayBoost: Record<string, [number, number]>;
  experienceDelayMultipliers?: Record<string, number>;
  segmentLength?: {
    referenceKm: number;
    minScale: number;
    maxScale: number;
  };
  bookingMissHintDelayMin?: number;
  nightFatigueBump: boolean;
}

export function loadIcelandWeatherDrivingPolicy(
  cwd: string = process.cwd(),
): WeatherDrivingPolicyFile {
  return readJson(
    join(
      cwd,
      IS_PACK,
      'knowledge/weather-driving-impact/is-weather-driving-policy.json',
    ),
  );
}

export function loadIcelandDaylightDrivingPolicy(
  cwd: string = process.cwd(),
): DaylightDrivingPolicy {
  return readJson(
    join(cwd, IS_PACK, 'knowledge/daylight-season/is-daylight-driving-policy.json'),
  );
}

export function loadIcelandRegulationSeverityItems(
  cwd: string = process.cwd(),
): RegulationNormItem[] {
  const raw = readJson<{ items: RegulationNormItem[] }>(
    join(cwd, IS_PACK, 'knowledge/regulations/is-regulations-severity.json'),
  );
  return raw.items;
}
