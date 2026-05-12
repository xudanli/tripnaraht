/**
 * Vehicle × terrain scenario matrix — executable corridor moat (Iceland camper / F-road lens).
 *
 * Geo supplies geometry; this layer answers physical executability for a vehicle class.
 */

import type { ExecutionState, VehicleClass } from '../../decision/hazard/travel-hazard.types';

/** Named corridor physics scenarios (extend as road-graph tags arrive). */
export type TerrainScenario =
  | 'F_ROAD_WET_GRAVEL'
  | 'HIGH_CROSSWIND_PASS'
  | 'GENERAL_PAVED_CORRIDOR';

/**
 * Static compatibility surface. Tune with product / safety policy — not GeoAgent logic.
 *
 * Rows: driving physics scenario. Columns: {@link VehicleClass}.
 */
export const TERRAIN_VEHICLE_COMPATIBILITY_MATRIX: Record<
  TerrainScenario,
  Record<VehicleClass, ExecutionState>
> = {
  F_ROAD_WET_GRAVEL: {
    SEDAN: 'BLOCKED',
    SUV_4WD: 'HIGH_RISK',
    CAMPERVAN: 'HIGH_RISK',
    EV_CAMPERVAN: 'HIGH_RISK',
  },
  HIGH_CROSSWIND_PASS: {
    SEDAN: 'DEGRADED',
    SUV_4WD: 'HIGH_RISK',
    CAMPERVAN: 'BLOCKED',
    EV_CAMPERVAN: 'HIGH_RISK',
  },
  GENERAL_PAVED_CORRIDOR: {
    SEDAN: 'EXECUTABLE',
    SUV_4WD: 'EXECUTABLE',
    CAMPERVAN: 'EXECUTABLE',
    EV_CAMPERVAN: 'EXECUTABLE',
  },
};

export function lookupTerrainVehicleExecutionState(
  scenario: TerrainScenario,
  vehicleClass: VehicleClass,
): ExecutionState {
  return TERRAIN_VEHICLE_COMPATIBILITY_MATRIX[scenario][vehicleClass];
}
