/**
 * Combined Lyapunov rise + anti-contractive step + iteration budget ⇒ divergence verdict.
 * (Distinct from residual-only divergence in convergence-formalization.)
 */

export type LyapunovDivergenceVerdict = 'OK' | 'DIVERGENT';

export interface LyapunovDivergenceInput {
  /** V(t+1) − V(t) — positive means energy increased. */
  energyDelta: number;
  /** From fixed-point step (+1 contractive, −1 expansive). */
  contractionRate: number;
  iterationIndex: number;
  maxIter: number;
}

/**
 * Divergent when energy rises while the operator step is expansive and iteration budget is exhausted.
 */
export function evaluateLyapunovDivergence(input: LyapunovDivergenceInput): LyapunovDivergenceVerdict {
  const exhausted = input.iterationIndex >= input.maxIter;
  const risingEnergy = input.energyDelta > 1e-9;
  const antiContractive = input.contractionRate < 0;

  if (risingEnergy && antiContractive && exhausted) {
    return 'DIVERGENT';
  }
  return 'OK';
}
