/**
 * Layer-1 Weather physical thresholds (C1 strict).
 *
 * This file intentionally stays dependency-free so it can be imported by:
 * - fact derivation
 * - guards / evidence bundle assembly
 * - kernel/skills (future)
 */

export type VehicleType = 'SEDAN' | 'SUV' | 'CAMPERVAN' | 'TRUCK' | 'UNKNOWN';

export const DRIVE_SAFETY_V1 = {
  rule_id: 'drive_safety_v1',
  /**
   * Wind speed threshold for high-profile vehicles (SUV/Campervan).
   * Spec: 18 m/s (≈ Beaufort 8).
   */
  wind_threshold_mps_high_profile: 18,
} as const;

export function normalizeVehicleType(v: unknown): VehicleType {
  const s = String(v ?? '').toUpperCase().trim();
  if (s === 'SUV') return 'SUV';
  if (s === 'CAMPERVAN' || s === 'CAMPER_VAN' || s === 'CAMPER') return 'CAMPERVAN';
  if (s === 'SEDAN') return 'SEDAN';
  if (s === 'TRUCK') return 'TRUCK';
  return 'UNKNOWN';
}

export function driveSafetyWindThresholdMps(vehicleType: unknown): number {
  const vt = normalizeVehicleType(vehicleType);
  if (vt === 'SUV' || vt === 'CAMPERVAN') return DRIVE_SAFETY_V1.wind_threshold_mps_high_profile;
  // Default: keep slightly higher for low-profile vehicles; can be refined later.
  return 20;
}

