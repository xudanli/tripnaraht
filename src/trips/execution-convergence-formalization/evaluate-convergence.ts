/**
 * Evaluates execution convergence / fixed-point semantics over F ≈ Neptune → ECO → Closure → (Patch).
 */

import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { ConvergenceSemanticsOptions, ExecutionConvergenceState } from './convergence-semantics.types';

export type { ConvergenceSemanticsOptions, ExecutionConvergenceState } from './convergence-semantics.types';

const DEFAULT_EPS_RES = 0.06;
const DEFAULT_EPS_MAN = 0.08;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/** Positive scalar “instability” outside threshold slab (0 on manifold interior). */
export function manifoldViolation(c: EcoNeptuneClosureEvaluation): number {
  const t = c.thresholds;
  const v = Math.max(
    0,
    c.ecoDriftScore - t.driftMax,
    t.stabilityMin - c.stabilityScore,
    t.convergenceMin - c.semanticConvergence,
  );
  return v;
}

/** [0,1] — 1 when sitting comfortably inside thresholds. */
export function stabilityManifoldScore(c: EcoNeptuneClosureEvaluation): number {
  return clamp01(1 - Math.min(1, manifoldViolation(c) * 4));
}

/** Exported for fixed-point snapshots — mean excess outside closure thresholds. */
export function compositeInstability(c: EcoNeptuneClosureEvaluation): number {
  const t = c.thresholds;
  const d = Math.max(0, c.ecoDriftScore - t.driftMax);
  const s = Math.max(0, t.stabilityMin - c.stabilityScore);
  const g = Math.max(0, t.convergenceMin - c.semanticConvergence);
  return (d + s + g) / 3;
}

/**
 * Normalized mismatch between two Neptune repair bundles (decision surface delta).
 */
export function computeNeptuneResidualDelta(a: NeptuneRepairResult, b: NeptuneRepairResult): number {
  const slotsA = new Set(a.changedSlotIds);
  const slotsB = new Set(b.changedSlotIds);
  let sym = 0;
  for (const x of slotsA) if (!slotsB.has(x)) sym++;
  for (const x of slotsB) if (!slotsA.has(x)) sym++;
  const union = new Set([...slotsA, ...slotsB]).size || 1;
  const slotPart = sym / union;

  const codesA = [...new Set(a.triggers.map(t => t.code))].sort().join('|');
  const codesB = [...new Set(b.triggers.map(t => t.code))].sort().join('|');
  const triggerPart = codesA === codesB ? 0 : 0.45;

  const vmPart =
    a.irVm.ok === b.irVm.ok && Math.abs(a.irVm.pathCost - b.irVm.pathCost) < 1e-6 ? 0 : 0.2;

  return clamp01(0.45 * slotPart + 0.35 * triggerPart + 0.2 * vmPart);
}

function opts(o?: ConvergenceSemanticsOptions) {
  return {
    epsilonResidual: o?.epsilonResidual ?? DEFAULT_EPS_RES,
    epsilonManifold: o?.epsilonManifold ?? DEFAULT_EPS_MAN,
  };
}

/** After two iterations: residual between Neptune outputs + contraction of instability + manifold after final closure. */
export function evaluateTwoPassConvergence(
  neptunePass1: NeptuneRepairResult,
  neptunePass2: NeptuneRepairResult,
  closurePass1: EcoNeptuneClosureEvaluation,
  closurePass2: EcoNeptuneClosureEvaluation,
  options?: ConvergenceSemanticsOptions,
): ExecutionConvergenceState {
  const { epsilonResidual, epsilonManifold } = opts(options);
  const residualDelta = computeNeptuneResidualDelta(neptunePass1, neptunePass2);

  const i1 = compositeInstability(closurePass1);
  const i2 = compositeInstability(closurePass2);
  const contractionRate =
    i1 <= 1e-9 ? clamp01(1 - i2) : clamp01(Math.max(0, (i1 - i2) / i1));

  const manifold = stabilityManifoldScore(closurePass2);
  const mv = manifoldViolation(closurePass2);

  const isFixedPoint =
    residualDelta <= epsilonResidual &&
    mv <= epsilonManifold &&
    !closurePass2.shouldRerunNeptune;

  return {
    isFixedPoint,
    residualDelta,
    contractionRate,
    stabilityManifold: manifold,
    epsilonResidual,
    epsilonManifold,
  };
}

/** Single ECO+closure pass: no pairwise Neptune residual; fixed-point iff closure says stop and manifold small. */
export function evaluateSinglePassConvergence(
  closure: EcoNeptuneClosureEvaluation,
  options?: ConvergenceSemanticsOptions,
): ExecutionConvergenceState {
  const { epsilonManifold } = opts(options);
  const manifold = stabilityManifoldScore(closure);
  const mv = manifoldViolation(closure);
  const isFixedPoint = !closure.shouldRerunNeptune && mv <= epsilonManifold;

  return {
    isFixedPoint,
    residualDelta: 0,
    contractionRate: isFixedPoint ? 1 : clamp01(1 - mv),
    stabilityManifold: manifold,
    epsilonManifold,
  };
}
