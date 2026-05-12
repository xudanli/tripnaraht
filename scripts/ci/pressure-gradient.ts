/**
 * P-CI-Pressure-3 — pressure velocity from two replayable snapshots (deterministic).
 */

import type { PressureGradient, RuntimePressureInputs, SystemPressureState } from './pressure-types';

export interface PressureComparableSnapshot {
  physicsPressure: number;
  tripsPressure: number;
  entropyPressure: number;
  coupling: number;
  stability: number;
  fusedPhysicsPressure?: number;
  fusedStability?: number;
  runtimePressure?: number;
  runtimeInputs?: Partial<RuntimePressureInputs>;
}

function num(x: unknown, fallback = 0): number {
  return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

export function toComparableSnapshot(state: SystemPressureState): PressureComparableSnapshot {
  const ro = state.runtimeOverlay;
  return {
    physicsPressure: state.physicsPressure,
    tripsPressure: state.tripsPressure,
    entropyPressure: state.entropyPressure,
    coupling: state.coupling,
    stability: state.stability,
    fusedPhysicsPressure: ro?.fusedPhysicsPressure,
    fusedStability: ro?.fusedStability,
    runtimePressure: ro?.runtimePressure,
    runtimeInputs: ro?.inputs,
  };
}

function rate(inp: Partial<RuntimePressureInputs> | undefined, key: keyof RuntimePressureInputs): number {
  return clamp01(num(inp?.[key], 0));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Finite differences between previous and current snapshots; null if no previous. */
export function computePressureGradient(
  prev: PressureComparableSnapshot | null,
  curr: PressureComparableSnapshot,
): PressureGradient | null {
  if (!prev) {
    return null;
  }

  const pi = prev.runtimeInputs ?? {};
  const ci = curr.runtimeInputs ?? {};

  let dFusedPhysics = 0;
  let dFusedStability = 0;
  if (
    prev.fusedPhysicsPressure !== undefined &&
    curr.fusedPhysicsPressure !== undefined
  ) {
    dFusedPhysics = curr.fusedPhysicsPressure - prev.fusedPhysicsPressure;
  } else {
    dFusedPhysics = curr.physicsPressure - prev.physicsPressure;
  }
  if (prev.fusedStability !== undefined && curr.fusedStability !== undefined) {
    dFusedStability = curr.fusedStability - prev.fusedStability;
  } else {
    dFusedStability = curr.stability - prev.stability;
  }

  return {
    dPhysicsPressure: curr.physicsPressure - prev.physicsPressure,
    dTripsPressure: curr.tripsPressure - prev.tripsPressure,
    dEntropyPressure: curr.entropyPressure - prev.entropyPressure,
    dCoupling: curr.coupling - prev.coupling,
    dStability: curr.stability - prev.stability,
    dRuntimePressure: num(curr.runtimePressure, 0) - num(prev.runtimePressure, 0),
    dEcoDriftRate: rate(ci, 'ecoDriftRate') - rate(pi, 'ecoDriftRate'),
    dIdentityRejectRate: rate(ci, 'identityRejectRate') - rate(pi, 'identityRejectRate'),
    dClosureRetryRate: rate(ci, 'closureRetryRate') - rate(pi, 'closureRetryRate'),
    dFusedPhysicsPressure: dFusedPhysics,
    dFusedStability: dFusedStability,
  };
}
