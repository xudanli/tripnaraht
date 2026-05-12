/**
 * P-Next 9 — Lift {@link PhysicsFieldIndex} to a coarse causal graph (domain aggregates + leg hooks).
 */

import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { CausalEdge, CausalGraph, CausalNode } from './causal-graph.types';

const WEATHER_ID = 'domain:weather';
const ROUTE_ID = 'domain:route';
const FUEL_ID = 'domain:fuel';
const TEMPORAL_ID = 'domain:temporal';

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Projects leg-wise physics into four domain nodes + canonical causal edges.
 * This is the minimal “causal physics graph” suitable for intervention planning.
 */
export function projectPhysicsIndexToCausalGraph(index: PhysicsFieldIndex): CausalGraph {
  const rows = Object.values(index.byLegId);
  const exposures = rows.map(r => r.stateVector.exposure);
  const mobilities = rows.map(r => r.stateVector.mobility);
  const energies = rows.map(r => r.stateVector.energy);
  const pressures = rows.map(r => r.stateVector.temporalPressure);

  const nodes: CausalNode[] = [
    {
      id: WEATHER_ID,
      type: 'WEATHER',
      state: {
        meanExposure: mean(exposures),
        legCount: rows.length,
      },
    },
    {
      id: ROUTE_ID,
      type: 'ROUTE',
      state: {
        meanMobility: mean(mobilities),
        mobilityStress: mean(mobilities.map(m => 1 - m)),
      },
    },
    {
      id: FUEL_ID,
      type: 'FUEL',
      state: {
        meanEnergy: mean(energies),
        energyStress: mean(energies.map(e => 1 - e)),
      },
    },
    {
      id: TEMPORAL_ID,
      type: 'TEMPORAL',
      state: {
        meanTemporalPressure: mean(pressures),
      },
    },
  ];

  const edges: CausalEdge[] = [
    { from: WEATHER_ID, to: ROUTE_ID, relation: 'CAUSES', weight: 0.55 },
    { from: FUEL_ID, to: ROUTE_ID, relation: 'CONSTRAINS', weight: 0.45 },
    { from: ROUTE_ID, to: TEMPORAL_ID, relation: 'AMPLIFIES', weight: 0.5 },
    { from: WEATHER_ID, to: TEMPORAL_ID, relation: 'CAUSES', weight: 0.35 },
  ];

  return { nodes, edges };
}
