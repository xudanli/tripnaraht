/**
 * P10 — compare counterfactual runs: scoring, regret, trace divergence.
 */

import type {
  ExecutionSimulationRunResult,
  SimulationDiffReport,
  SimulationDivergencePoint,
} from './execution-simulation.types';

const FAILURE_WEIGHT = 1000;

/** Lower is better — pathCost + penalties for CHECK failures (blocked / missing witness). */
export function scoreSimulationRun(run: ExecutionSimulationRunResult): number {
  let s = run.irRun.pathCost;
  s += run.irRun.failures.length * FAILURE_WEIGHT;
  return s;
}

export function selectBestByScore(
  results: ExecutionSimulationRunResult[],
): { variantId: string; score: number } {
  if (!results.length) {
    throw new Error('simulationDiff: empty results');
  }
  let best = results[0];
  let bestScore = scoreSimulationRun(best);
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    const sc = scoreSimulationRun(r);
    if (sc < bestScore) {
      best = r;
      bestScore = sc;
    }
  }
  return { variantId: best.variantId, score: bestScore };
}

export function computeRegret(
  results: ExecutionSimulationRunResult[],
  bestScore: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of results) {
    out[r.variantId] = scoreSimulationRun(r) - bestScore;
  }
  return out;
}

/** First logical-clock index where two traces diverge (op or traceId). */
export function executionDivergenceIndex(
  a: ExecutionSimulationRunResult,
  b: ExecutionSimulationRunResult,
): number | null {
  const ta = a.outcome.trace;
  const tb = b.outcome.trace;
  const len = Math.max(ta.length, tb.length);
  for (let i = 0; i < len; i++) {
    const ea = ta[i];
    const eb = tb[i];
    if (!ea || !eb) {
      return i;
    }
    if (ea.op !== eb.op || ea.traceId !== eb.traceId) {
      return i;
    }
  }
  return null;
}

export function findExecutionDivergence(
  results: ExecutionSimulationRunResult[],
): SimulationDivergencePoint[] {
  const points: SimulationDivergencePoint[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i];
      const b = results[j];
      const idx = executionDivergenceIndex(a, b);
      if (idx !== null) {
        points.push({
          variantA: a.variantId,
          variantB: b.variantId,
          traceIndex: idx,
          detail: `trace diverges at logical step ${idx}`,
        });
      }
    }
  }
  return points;
}

export function diffSimulationResults(
  results: ExecutionSimulationRunResult[],
): SimulationDiffReport {
  const scoresByVariantId: Record<string, number> = {};
  for (const r of results) {
    scoresByVariantId[r.variantId] = scoreSimulationRun(r);
  }

  const best = selectBestByScore(results);
  const regretByVariantId = computeRegret(results, best.score);
  const divergencePoints = findExecutionDivergence(results);

  return {
    bestVariantId: best.variantId,
    bestScore: best.score,
    scoresByVariantId,
    regretByVariantId,
    divergencePoints,
  };
}
