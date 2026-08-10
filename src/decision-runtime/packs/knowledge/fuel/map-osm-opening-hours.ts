/**
 * Map OSM / Place opening_hours strings → IcelandFuelOpeningMode.
 */

import type { IcelandFuelOpeningMode } from './iceland-fuel.types';

const ALWAYS_OPEN_RE =
  /^(24\/7|24x7|around.?the.?clock|always.?open|open.?24|Mo-Su\s*00:00-24:00|00:00-24:00)$/i;

/**
 * Conservative mapper:
 * - clear 24/7 → ALWAYS_OPEN
 * - any other non-empty schedule → SCHEDULED
 * - missing / unparsable → UNKNOWN
 */
export function mapOsmOpeningHoursToFuelOpeningMode(
  raw?: string | null,
): IcelandFuelOpeningMode {
  if (raw == null) return 'UNKNOWN';
  const s = String(raw).trim();
  if (!s) return 'UNKNOWN';
  if (ALWAYS_OPEN_RE.test(s)) return 'ALWAYS_OPEN';
  // OSM "24/7" sometimes embedded
  if (/\b24\/7\b/i.test(s) && !/;/.test(s)) return 'ALWAYS_OPEN';
  return 'SCHEDULED';
}

export function mapSelfServiceToUnattended(
  raw?: string | null,
): boolean | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === 'yes' || s === 'only' || s === 'true' || s === '1') return true;
  if (s === 'no' || s === 'false' || s === '0') return false;
  return undefined;
}
