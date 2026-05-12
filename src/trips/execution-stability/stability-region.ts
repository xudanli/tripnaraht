/**
 * Declarative stability region: low energy + small residual + contractive step.
 */

export interface StabilityRegionResult {
  inRegion: boolean;
}

export interface StabilityRegionInput {
  lyapunovValue: number;
  residualDelta: number;
  /** +1 / −1 from fixed-point layer, or positive fraction from softer metrics. */
  contractionRate: number;
  epsilonV?: number;
  etaResidual?: number;
}

const DEFAULT_EPS_V = 0.18;
const DEFAULT_ETA = 0.06;

export function isInStabilityRegion(input: StabilityRegionInput): StabilityRegionResult {
  const epsV = input.epsilonV ?? DEFAULT_EPS_V;
  const eta = input.etaResidual ?? DEFAULT_ETA;
  const contractive = input.contractionRate > 0;

  const inRegion =
    input.lyapunovValue < epsV && input.residualDelta < eta && contractive;

  return { inRegion };
}
