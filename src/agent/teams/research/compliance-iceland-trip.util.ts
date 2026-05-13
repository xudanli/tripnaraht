import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';

type Trip = NonNullable<PhaseExecutorContext['tripPlanRequest']>;

/**
 * 与 Gatekeeper 冰岛判定对齐的轻量副本：供 Compliance Member 决定是否拉 SafeTravel RSS。
 */
export function isIcelandTripForComplianceResearch(trip: Trip | undefined): boolean {
  if (!trip) return false;
  const destination = typeof trip.destination === 'string' ? trip.destination.toLowerCase() : '';
  const origin = trip.origin && typeof trip.origin === 'string' ? trip.origin.toLowerCase() : '';
  const stringCheck =
    destination.includes('iceland') ||
    destination.includes('冰岛') ||
    origin.includes('iceland') ||
    origin.includes('冰岛') ||
    /F\d{1,3}/i.test(destination) ||
    /F\d{1,3}/i.test(origin);
  if (stringCheck) return true;
  const isIcelandCoord = (loc: { lat: number; lng: number }) =>
    loc.lat >= 63 && loc.lat <= 67 && loc.lng >= -25 && loc.lng <= -13;
  if (trip.destination && typeof trip.destination !== 'string') {
    if (isIcelandCoord(trip.destination)) return true;
  }
  if (trip.origin && typeof trip.origin !== 'string') {
    if (isIcelandCoord(trip.origin)) return true;
  }
  return false;
}
