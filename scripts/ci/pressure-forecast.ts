/**
 * P-CI-Pressure-3 — linear short-horizon extrapolation (deterministic, no ML).
 */

import type { PressureForecast, PressureForecastHorizon, PressureGradient } from './pressure-types';
import type { PressureComparableSnapshot } from './pressure-gradient';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function horizon(
  refPhysics: number,
  refStability: number,
  dP: number,
  dS: number,
  k: number,
  useFusion: boolean,
  fusedP?: number,
  fusedS?: number,
): PressureForecastHorizon {
  const physics = clamp01(refPhysics + dP * k);
  const stability = clamp01(refStability + dS * k);
  if (!useFusion || fusedP === undefined || fusedS === undefined) {
    return { physicsPressure: physics, stability };
  }
  return {
    physicsPressure: physics,
    stability,
    fusedPhysicsPressure: clamp01(fusedP + dP * k),
    fusedStability: clamp01(fusedS + dS * k),
  };
}

export function computePressureForecast(
  curr: PressureComparableSnapshot,
  gradient: PressureGradient | null,
): PressureForecast {
  const dP = gradient?.dFusedPhysicsPressure ?? gradient?.dPhysicsPressure ?? 0;
  const dS = gradient?.dFusedStability ?? gradient?.dStability ?? 0;

  const refPhysics = curr.fusedPhysicsPressure ?? curr.physicsPressure;
  const refStability = curr.fusedStability ?? curr.stability;
  const fusedP = curr.fusedPhysicsPressure;
  const fusedS = curr.fusedStability;
  const useFusion = fusedP !== undefined && fusedS !== undefined;

  const t1 = horizon(refPhysics, refStability, dP, dS, 1, useFusion, fusedP, fusedS);
  const t2 = horizon(refPhysics, refStability, dP, dS, 2, useFusion, fusedP, fusedS);
  const t3 = horizon(refPhysics, refStability, dP, dS, 3, useFusion, fusedP, fusedS);

  const stabilities = [t1.stability, t2.stability, t3.stability];
  if (useFusion && t1.fusedStability !== undefined && t2.fusedStability !== undefined && t3.fusedStability !== undefined) {
    stabilities.push(t1.fusedStability, t2.fusedStability, t3.fusedStability);
  }
  const instabilityRisk = clamp01(1 - Math.min(...stabilities));

  let trend: PressureForecast['trend'] = 'stable';
  const netStabilityVelocity = gradient?.dStability ?? 0;
  const netPhysicsVelocity = gradient?.dPhysicsPressure ?? 0;
  if (netStabilityVelocity > 0.02 || (netPhysicsVelocity < -0.02 && netStabilityVelocity >= 0)) {
    trend = 'improving';
  } else if (netStabilityVelocity < -0.02 || netPhysicsVelocity > 0.05) {
    trend = 'degrading';
  }

  return {
    horizons: { t1, t2, t3 },
    trend,
    instabilityRisk,
  };
}
