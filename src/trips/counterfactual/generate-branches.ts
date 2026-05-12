/**
 * P-Next 8 — Standard library of physically interpretable perturbations (weather / route / fuel / time).
 */

import type { CounterfactualBranch } from './physics-branch.types';

/**
 * Four canonical branches: stronger exposure, weaker mobility, tighter energy, higher temporal pressure.
 * Caller supplies `derivedFrom` (replica id, run id, …).
 */
export function generateStandardCounterfactualBranches(derivedFrom: string): CounterfactualBranch[] {
  return [
    {
      branchId: `${derivedFrom}:weather-up`,
      derivedFrom,
      probabilityWeight: 0.22,
      modifiedPhysics: {
        stateVector: { exposure: 0.14 },
      },
    },
    {
      branchId: `${derivedFrom}:route-stress`,
      derivedFrom,
      probabilityWeight: 0.22,
      modifiedPhysics: {
        stateVector: { mobility: -0.14 },
      },
    },
    {
      branchId: `${derivedFrom}:fuel-down`,
      derivedFrom,
      probabilityWeight: 0.22,
      modifiedPhysics: {
        stateVector: { energy: -0.12 },
      },
    },
    {
      branchId: `${derivedFrom}:temporal-spike`,
      derivedFrom,
      probabilityWeight: 0.22,
      modifiedPhysics: {
        stateVector: { temporalPressure: 0.14 },
      },
    },
  ];
}
