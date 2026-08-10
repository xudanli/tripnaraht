/**
 * Shared helpers for invalidating overall readiness after driving-settings writes
 * and notifying Mobile WS (changedSections: ['readiness']).
 */

import { OVERALL_READINESS_CACHE_KEY } from '../../overall-readiness/utils/overall-readiness-cache.util';
import { selfDriveReadinessChangedBus } from '../../overall-readiness/ports/self-drive-readiness-changed.bus';

export const SELF_DRIVE_READINESS_META_KEY = 'selfDriveReadiness';

export function parseIsdContextVersionNumber(contextVersion: unknown): number {
  if (typeof contextVersion === 'number' && Number.isFinite(contextVersion)) {
    return Math.max(1, Math.floor(contextVersion));
  }
  if (typeof contextVersion === 'string') {
    const m = /^cv_(\d+)$/.exec(contextVersion);
    if (m) return Math.max(1, Number(m[1]));
    const n = Number(contextVersion);
    if (Number.isFinite(n)) return Math.max(1, Math.floor(n));
  }
  return 1;
}

/**
 * Clear readiness cache + bump selfDriveReadiness.contextVersion on trip metadata (in-place).
 * Returns the numeric contextVersion for WS payload.
 */
export function stampReadinessInvalidationOnMeta(
  meta: Record<string, unknown>,
  isdContextVersion: unknown,
): number {
  delete meta[OVERALL_READINESS_CACHE_KEY];

  const readinessMeta =
    meta[SELF_DRIVE_READINESS_META_KEY] &&
    typeof meta[SELF_DRIVE_READINESS_META_KEY] === 'object' &&
    !Array.isArray(meta[SELF_DRIVE_READINESS_META_KEY])
      ? {
          ...(meta[SELF_DRIVE_READINESS_META_KEY] as Record<string, unknown>),
        }
      : {};

  const prevCv =
    typeof readinessMeta.contextVersion === 'number' &&
    Number.isFinite(readinessMeta.contextVersion)
      ? readinessMeta.contextVersion
      : 0;
  const fromIsd = parseIsdContextVersionNumber(isdContextVersion);
  const nextCv = Math.max(fromIsd, prevCv + 1);
  readinessMeta.contextVersion = nextCv;
  meta[SELF_DRIVE_READINESS_META_KEY] = readinessMeta;
  return nextCv;
}

export function emitSelfDriveReadinessChanged(
  tripId: string,
  contextVersion: number,
): void {
  selfDriveReadinessChangedBus.emit({ tripId, contextVersion });
}
