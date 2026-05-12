/**
 * P-CI-4 — runtime application of pressure-derived control (audit / replay friendly).
 */

export type NeptuneRetryPolicySetting = 'allow' | 'restrict' | 'block';

/** Mirrors scripts/ci ControlSignal for interoperability with readiness artifacts. */
export interface PressureControlSignal {
  ecoThrottle: number;
  identityGuardTighten: boolean;
  closureRetryLimit: number;
  neptuneRetryPolicy: NeptuneRetryPolicySetting;
}

/** Latest regulation snapshot written on each apply tick (signals.pressureRegulation). */
/** Optional closure evaluation hint when digest not yet on signals (same tick). */
export interface ClosurePressureHint {
  stabilityScore: number;
}

export interface PressureRegulationSnapshot {
  appliedAt: string;
  enabled: boolean;
  source: 'disabled' | 'env_json' | 'derived';
  fusedStabilityProxy?: number;
  instabilityRiskProxy?: number;
  fusedPhysicsPressureProxy?: number;
  control: PressureControlSignal;
  /**
   * Multiply resolved identity guard threshold (P-E1); values below 1 tighten reject sensitivity.
   * Always 1 when regulation disabled.
   */
  mutationThresholdFactor: number;
}
