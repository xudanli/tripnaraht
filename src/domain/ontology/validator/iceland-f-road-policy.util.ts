/**
 * Iceland highland F-road seasonal accessibility (policy stub prior to Road.is API).
 *
 * Real closures vary by snow/weather; this is a conservative UTC calendar proxy so that
 * PREVIEW/COMMIT can emit SEGMENT_SEASONALLY_CLOSED for INTERRUPT-tier routing when the DB
 * row has no seasonal_closures yet.
 *
 * Open window (high-level): approximately Jun 20 – Oct 14 UTC each year.
 * @see https://www.road.is/ — replace with live feed when integrated.
 */

/** Policy label for audit / telemetry when using defaults instead of Road.is rows. */
export const ICELAND_F_ROAD_POLICY_SOURCE = 'iceland_fr_highland_calendar_v1';

/**
 * Returns true when enter_at falls outside the typical summer open window for Icelandic interior F-roads.
 * Used only for segments with segment_type === 'F_ROAD' when DB seasonal_closures are absent or do not match.
 */
export function isIcelandHighlandFRoadSeasonallyClosed(enterAt: Date): boolean {
  const m = enterAt.getUTCMonth() + 1;
  const d = enterAt.getUTCDate();

  // Summer-open corridor (approximate): Jun 20 – Oct 14 inclusive.
  if (m === 7 || m === 8 || m === 9) return false;
  if (m === 6 && d >= 20) return false;
  if (m === 10 && d < 15) return false;

  return true;
}
