/**
 * P-Next 5 — Default invariant registry (physics bounds, fuel sanity, exposure caps).
 */

import type { ExecutionInvariant } from './execution-invariant.types';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';

function physicsMobilityOrPassable(proof: ExecutionProof): boolean {
  for (const row of Object.values(proof.witness.physicsByLegId)) {
    const m = row.mobility;
    if (Number.isNaN(m) || m < 0 || m > 1) {
      return false;
    }
  }
  return true;
}

function temporalVmCoherence(proof: ExecutionProof): boolean {
  const vm = proof.witness.vmSummary;
  return vm.traceSteps >= 0 && Number.isFinite(vm.pathCost);
}

function fuelFeasibilityWitness(proof: ExecutionProof): boolean {
  /** Structural only — detailed fuel math stays in pipeline; witness carries physics energy axis [0,1]. */
  for (const row of Object.values(proof.witness.physicsByLegId)) {
    if (row.energy < 0 || row.energy > 1) {
      return false;
    }
  }
  return true;
}

function weatherExposureBound(proof: ExecutionProof): boolean {
  for (const row of Object.values(proof.witness.physicsByLegId)) {
    if (row.exposure < 0 || row.exposure > 1) {
      return false;
    }
  }
  return true;
}

function routeMobilityLowerBound(proof: ExecutionProof): boolean {
  for (const [legId, row] of Object.entries(proof.witness.physicsByLegId)) {
    if (!legId) return false;
    if (row.derived === 'IMPASSABLE') continue;
    if (row.mobility < 0) return false;
  }
  return true;
}

export const DEFAULT_EXECUTION_INVARIANTS: ExecutionInvariant[] = [
  {
    id: 'PHYSICS_MOBILITY_DOMAIN',
    severity: 'HARD',
    domain: 'PHYSICS',
    check: physicsMobilityOrPassable,
  },
  {
    id: 'TEMPORAL_VM_SUMMARY_FINITE',
    severity: 'HARD',
    domain: 'TEMPORAL',
    check: temporalVmCoherence,
  },
  {
    id: 'FUEL_ENERGY_AXIS_BOUND',
    severity: 'HARD',
    domain: 'FUEL',
    check: fuelFeasibilityWitness,
  },
  {
    id: 'WEATHER_EXPOSURE_BOUND',
    severity: 'SOFT',
    domain: 'WEATHER',
    check: weatherExposureBound,
  },
  {
    id: 'ROUTE_MOBILITY_NON_NEGATIVE',
    severity: 'HARD',
    domain: 'ROUTE',
    check: routeMobilityLowerBound,
  },
];
