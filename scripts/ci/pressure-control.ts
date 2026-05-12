/**
 * P-CI-Pressure-3 — deterministic feedforward control signal from pressure + gradient + forecast.
 * Consumers apply policy; this module does not mutate DAG / Neptune / IR.
 */

import type {
  ControlSignal,
  PressureForecast,
  PressureGradient,
  SystemPressureState,
} from './pressure-types';

const INSTABILITY_ECO_THROTTLE = 0.7;
const IDENTITY_SLOPE_TIGHTEN = 0.1;
const NEPTUNE_BLOCK_PHYSICS = 0.8;

export function defaultControlSignal(): ControlSignal {
  return {
    ecoThrottle: 1,
    identityGuardTighten: false,
    closureRetryLimit: 2,
    neptuneRetryPolicy: 'allow',
  };
}

export function computeControlSignal(
  pressure: SystemPressureState,
  gradient: PressureGradient | null,
  forecast: PressureForecast,
): ControlSignal {
  const base = defaultControlSignal();
  const risk = forecast.instabilityRisk;

  if (risk > INSTABILITY_ECO_THROTTLE) {
    base.ecoThrottle = 0.5;
    base.closureRetryLimit = 1;
  } else if (risk > 0.5) {
    base.ecoThrottle = 0.85;
    base.closureRetryLimit = 1;
    base.neptuneRetryPolicy = 'restrict';
  }

  const dir = gradient?.dIdentityRejectRate ?? 0;
  if (dir > IDENTITY_SLOPE_TIGHTEN) {
    base.identityGuardTighten = true;
  }

  const dP = gradient?.dFusedPhysicsPressure ?? gradient?.dPhysicsPressure ?? 0;
  const pT3 =
    forecast.horizons.t3.fusedPhysicsPressure ??
    forecast.horizons.t3.physicsPressure;

  if (pT3 > NEPTUNE_BLOCK_PHYSICS && dP > 0) {
    base.neptuneRetryPolicy = 'block';
  }

  return base;
}
