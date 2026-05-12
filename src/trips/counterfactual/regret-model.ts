/**
 * P-Next 8 — Regret vs best semantic outcome + robustness across worlds.
 */

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function populationVariance(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  return mean(xs.map(x => (x - m) ** 2));
}

/** regret_i = semanticDistance_i - min_j semanticDistance_j (non-negative). */
export function regretDistributionFromDistances(semanticDistances: number[]): number[] {
  if (!semanticDistances.length) return [];
  const opt = Math.min(...semanticDistances);
  return semanticDistances.map(d => Math.max(0, d - opt));
}

/** Higher when stability scores cluster tightly across branches (1 = identical). */
export function robustnessScoreFromStabilities(stabilityScores: number[]): number {
  if (!stabilityScores.length) return 1;
  const v = populationVariance(stabilityScores);
  return Math.max(0, Math.min(1, 1 - Math.sqrt(v) * 2));
}

/** Expected regret under branch weights (weights normalized internally). */
export function expectedRegret(
  regrets: number[],
  weights: number[],
): number {
  if (!regrets.length) return 0;
  const w = weights.length === regrets.length ? weights : weights.slice(0, regrets.length);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  let s = 0;
  for (let i = 0; i < regrets.length; i++) {
    s += regrets[i]! * ((w[i] ?? 0) / sum);
  }
  return s;
}
