/**
 * 交通耗时合理性 — 与 FE `feasibility-travel-timing.ts` / BFF handoff §4 对齐
 */

export function isImplausibleTravelDuration(input: {
  distanceMeters?: number | null;
  durationMinutes?: number | null;
}): boolean {
  const distanceMeters = input.distanceMeters;
  const durationMinutes = input.durationMinutes;
  if (
    distanceMeters == null ||
    durationMinutes == null ||
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(durationMinutes) ||
    distanceMeters <= 0 ||
    durationMinutes <= 0
  ) {
    return false;
  }

  const km = distanceMeters / 1000;
  const min = durationMinutes;

  if (km >= 50 && min < km * 0.5) return true;
  if (km >= 5 && min / km > 5) return true;
  return false;
}
