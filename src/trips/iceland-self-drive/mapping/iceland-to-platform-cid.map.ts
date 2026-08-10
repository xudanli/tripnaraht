/**
 * Iceland Shadow cid → platform comparable constraint keys.
 * Unlisted Iceland cids are expected unmapped (Country Pack / Preview-only).
 */

import type { PlatformComparableConstraintKey } from '../types/iceland-shadow-vs-platform-contrast.types';

export const ICELAND_TO_PLATFORM_CID_MAP: Record<
  string,
  PlatformComparableConstraintKey
> = {
  ICELAND_DAY_DRIVE_CAP_001: 'MAX_DAILY_DRIVE',
  ICELAND_VEHICLE_FROAD_001: 'OFFICIAL_IS_FROAD_2WD',
  ICELAND_VEHICLE_4WD_001: 'VEHICLE_4WD_REQUIRED',
  ICELAND_VEHICLE_RIVER_001: 'RIVER_CROSSING_SELF_DRIVE',
  ICELAND_LODGING_ANCHOR_001: 'CONFIRMED_LODGING_ANCHOR',
};

/** Inverse: platform key → preferred Iceland cid (for unmapped platform detection). */
export const PLATFORM_TO_ICELAND_CID_MAP: Record<
  PlatformComparableConstraintKey,
  string
> = {
  MAX_DAILY_DRIVE: 'ICELAND_DAY_DRIVE_CAP_001',
  OFFICIAL_IS_FROAD_2WD: 'ICELAND_VEHICLE_FROAD_001',
  VEHICLE_4WD_REQUIRED: 'ICELAND_VEHICLE_4WD_001',
  RIVER_CROSSING_SELF_DRIVE: 'ICELAND_VEHICLE_RIVER_001',
  CONFIRMED_LODGING_ANCHOR: 'ICELAND_LODGING_ANCHOR_001',
};

export function mapIcelandCidToPlatformKey(
  cid: string,
): PlatformComparableConstraintKey | undefined {
  return ICELAND_TO_PLATFORM_CID_MAP[cid];
}
