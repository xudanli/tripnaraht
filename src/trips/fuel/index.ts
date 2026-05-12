/**
 * P-FUEL-1 — Fuel reachability overlay physics (energy constraint surface).
 */

export type {
  ComputeFuelReachabilityInput,
  FuelPoiIndexEntry,
  FuelPolylineInput,
  FuelReachabilitySeverity,
  FuelReachabilitySummary,
  FuelRouteLegInput,
  VehicleFuelProfile,
} from './fuel-reachability.types';

export { computeEffectiveRangeKm, computeFuelReachability } from './compute-fuel-reachability';

export {
  DEFAULT_VEHICLE_FUEL_PROFILE,
  buildFuelPolylineFromPlan,
  extractFuelPoiIndexFromCandidates,
  summarizeFuelReachabilityForPlan,
} from './build-fuel-input-from-plan';
