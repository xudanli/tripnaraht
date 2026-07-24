/**
 * Load TEP driving load factor table from destination pack modifiers.
 * @see data/destination-packs/{cc}/modifiers/{cc}-driving-load.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DriveLoadTier } from '../contracts/tep-self-drive.types';

export interface DrivingLoadTierThreshold {
  min: number;
  max?: number;
}

export interface DrivingLoadConfig {
  modifierId: string;
  roadFactors: Record<string, number>;
  weatherFactors: Record<string, number>;
  vehicleFactors: Record<string, number>;
  penalties: {
    noviceAbroadMinutes: number;
    nightDrivingMultiplier: number;
    plannedStopMinutesMin: number;
    plannedStopMinutesMax: number;
  };
  tierThresholdsMinutes: Record<DriveLoadTier, DrivingLoadTierThreshold>;
}

const DEFAULT_CONFIG: DrivingLoadConfig = {
  modifierId: 'GLOBAL_DRIVING_LOAD',
  roadFactors: {
    paved: 1,
    narrowMountain: 1.15,
    gravel: 1.2,
  },
  weatherFactors: {
    moderate: 1.15,
    highImpact: 1.3,
  },
  vehicleFactors: {
    campervanLarge: 1.1,
  },
  penalties: {
    noviceAbroadMinutes: 30,
    nightDrivingMultiplier: 1.2,
    plannedStopMinutesMin: 10,
    plannedStopMinutesMax: 20,
  },
  tierThresholdsMinutes: {
    LOW: { min: 0, max: 180 },
    MEDIUM: { min: 181, max: 300 },
    HIGH: { min: 301, max: 420 },
    EXTREME: { min: 421 },
  },
};

export function loadDrivingLoadConfig(countryCode?: string): DrivingLoadConfig {
  if (!countryCode?.trim()) return DEFAULT_CONFIG;

  const path = join(
    process.cwd(),
    'data/destination-packs',
    countryCode.trim().toLowerCase(),
    'modifiers',
    `${countryCode.trim().toLowerCase()}-driving-load.json`,
  );

  if (!existsSync(path)) return DEFAULT_CONFIG;

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return {
    modifierId: String(raw.modifierId ?? `${countryCode.toUpperCase()}_DRIVING_LOAD`),
    roadFactors: (raw.roadFactors as Record<string, number>) ?? DEFAULT_CONFIG.roadFactors,
    weatherFactors:
      (raw.weatherFactors as Record<string, number>) ?? DEFAULT_CONFIG.weatherFactors,
    vehicleFactors:
      (raw.vehicleFactors as Record<string, number>) ?? DEFAULT_CONFIG.vehicleFactors,
    penalties: {
      ...DEFAULT_CONFIG.penalties,
      ...((raw.penalties as DrivingLoadConfig['penalties']) ?? {}),
    },
    tierThresholdsMinutes:
      (raw.tierThresholdsMinutes as DrivingLoadConfig['tierThresholdsMinutes']) ??
      DEFAULT_CONFIG.tierThresholdsMinutes,
  };
}

export function classifyDriveLoadTier(
  equivalentMinutes: number,
  config: DrivingLoadConfig = DEFAULT_CONFIG,
): DriveLoadTier {
  const tiers: DriveLoadTier[] = ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'];
  for (const tier of tiers) {
    const threshold = config.tierThresholdsMinutes[tier];
    const withinMax = threshold.max == null || equivalentMinutes <= threshold.max;
    if (equivalentMinutes >= threshold.min && withinMax) return tier;
  }
  return 'LOW';
}
