/**
 * Policy Lab DRIVE_SAFETY threshold resolution (wind / gust gate).
 * Code constants are fallback only when DB rule is missing/disabled.
 */

import {
  DRIVE_SAFETY_V1,
  driveSafetyWindThresholdMps as driveSafetyWindThresholdMpsFallback,
  normalizeVehicleType,
} from '../../trips/ontology/environment/weather.schema';

export const DRIVE_SAFETY_RULE_ID = 'drive_safety_v1';

/** Compatible alias historically seeded by Admin ensureDefaults. */
export const WIND_SPEED_DRIVE_LIMIT_RULE_ID = 'wind_speed_drive_limit_v1';

export interface DriveSafetyThresholdParams {
  kind?: 'DRIVE_SAFETY';
  unit?: 'mps' | 'kph';
  /** High-profile (SUV / campervan) threshold */
  high_profile_mps?: number;
  /** Default / low-profile threshold */
  default_mps?: number;
  /** Optional explicit map */
  thresholds_mps?: {
    high_profile?: number;
    default?: number;
    SEDAN?: number;
    SUV?: number;
    CAMPERVAN?: number;
    TRUCK?: number;
    UNKNOWN?: number;
  };
}

export const DEFAULT_DRIVE_SAFETY_PARAMS: DriveSafetyThresholdParams = {
  kind: 'DRIVE_SAFETY',
  unit: 'mps',
  high_profile_mps: DRIVE_SAFETY_V1.wind_threshold_mps_high_profile,
  default_mps: 20,
  thresholds_mps: {
    high_profile: DRIVE_SAFETY_V1.wind_threshold_mps_high_profile,
    default: 20,
  },
};

function toMps(value: number, unit: 'mps' | 'kph' | undefined): number {
  if (!Number.isFinite(value)) return NaN;
  if (unit === 'kph') return value / 3.6;
  return value;
}

/**
 * Resolve wind threshold (m/s) from a Policy Lab constraint row.
 * Falls back to weather.schema constants when params incomplete.
 */
export function resolveDriveSafetyThresholdMpsFromConfig(
  row: { enabled?: boolean; threshold?: number | null; params?: unknown } | null | undefined,
  vehicleType: unknown,
): number {
  if (!row || row.enabled === false) {
    return driveSafetyWindThresholdMpsFallback(vehicleType);
  }

  const params = (row.params && typeof row.params === 'object' ? row.params : {}) as DriveSafetyThresholdParams;
  const unit = params.unit === 'kph' ? 'kph' : 'mps';
  const vt = normalizeVehicleType(vehicleType);
  const map = params.thresholds_mps ?? {};

  const byType = map[vt];
  if (typeof byType === 'number' && Number.isFinite(byType)) {
    return toMps(byType, unit);
  }

  const isHigh = vt === 'SUV' || vt === 'CAMPERVAN';
  if (isHigh) {
    const hp =
      (typeof map.high_profile === 'number' ? map.high_profile : undefined) ??
      (typeof params.high_profile_mps === 'number' ? params.high_profile_mps : undefined);
    if (typeof hp === 'number' && Number.isFinite(hp)) return toMps(hp, unit);
  }

  const def =
    (typeof map.default === 'number' ? map.default : undefined) ??
    (typeof params.default_mps === 'number' ? params.default_mps : undefined);
  if (typeof def === 'number' && Number.isFinite(def)) return toMps(def, unit);

  // Legacy: single threshold field (often kph on wind_speed_drive_limit_v1)
  if (typeof row.threshold === 'number' && Number.isFinite(row.threshold)) {
    const legacyUnit = params.unit === 'mps' ? 'mps' : 'kph';
    return toMps(Number(row.threshold), legacyUnit);
  }

  return driveSafetyWindThresholdMpsFallback(vehicleType);
}
