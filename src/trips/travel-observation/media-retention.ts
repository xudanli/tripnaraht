/**
 * Q4 — LOOK_MEDIA_SHORT_TERM_V1 = min(capturedAt+72h, tripEnd+24h)
 */

export const LOOK_MEDIA_RETENTION_POLICY = 'LOOK_MEDIA_SHORT_TERM_V1' as const;

const HOUR_MS = 60 * 60 * 1000;
const CAPTURE_TTL_MS = 72 * HOUR_MS;
const TRIP_END_GRACE_MS = 24 * HOUR_MS;

export function computeMediaExpiresAt(
  capturedAt: string,
  tripEndAt?: string,
): string {
  const captureExpiry = Date.parse(capturedAt) + CAPTURE_TTL_MS;
  if (!tripEndAt) {
    return new Date(captureExpiry).toISOString();
  }
  const tripExpiry = Date.parse(tripEndAt) + TRIP_END_GRACE_MS;
  return new Date(Math.min(captureExpiry, tripExpiry)).toISOString();
}

export function isMediaExpired(
  capturedAt: string,
  nowMs: number,
  tripEndAt?: string,
): boolean {
  return nowMs >= Date.parse(computeMediaExpiresAt(capturedAt, tripEndAt));
}
