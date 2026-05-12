/**
 * Fixed-point evaluator: ‖S_{t+1} − S_t‖ proxies + contraction direction vs prior iterate.
 */

import { createHash } from 'crypto';
import type { NeptuneRepairResult } from '../decision/strategies/neptune';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import {
  compositeInstability,
  computeNeptuneResidualDelta,
  manifoldViolation,
} from './evaluate-convergence';
import type { ConvergenceSemanticsOptions } from './convergence-semantics.types';
import type { ExecutionFixedPoint, ExecutionStateSnapshot } from './execution-convergence.types';

export type { ExecutionFixedPoint, ExecutionStateSnapshot } from './execution-convergence.types';

const DEFAULT_EPS_RES = 0.06;
const DEFAULT_EPS_MAN = 0.08;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function mergeOpts(o?: ConvergenceSemanticsOptions) {
  return {
    epsilonResidual: o?.epsilonResidual ?? DEFAULT_EPS_RES,
    epsilonManifold: o?.epsilonManifold ?? DEFAULT_EPS_MAN,
  };
}

/** Stable digest over Neptune materialization + closure scalar summary (audit correlation). */
export function computeExecutionStateHash(
  neptune: NeptuneRepairResult,
  closure: EcoNeptuneClosureEvaluation,
): string {
  const payload = JSON.stringify({
    slots: [...new Set(neptune.changedSlotIds)].sort(),
    triggers: [...new Set(neptune.triggers.map(t => t.code))].sort(),
    vm: { ok: neptune.irVm.ok, pathCost: neptune.irVm.pathCost },
    closure: {
      drift: closure.ecoDriftScore,
      stab: closure.stabilityScore,
      sem: closure.semanticConvergence,
    },
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 32);
}

/** Build snapshot after first ECO+closure leg (before optional second Neptune). */
export function buildExecutionStateSnapshot(
  iterationIndex: number,
  neptune: NeptuneRepairResult,
  closure: EcoNeptuneClosureEvaluation,
): ExecutionStateSnapshot {
  const residualDelta = clamp01(manifoldViolation(closure));
  return {
    iterationIndex,
    residualDelta,
    neptune,
    closureInstability: compositeInstability(closure),
    stateHash: computeExecutionStateHash(neptune, closure),
  };
}

/**
 * Compare successive execution states. When `prev` is null, treats current residual as manifold-only (first iterate).
 */
export function evaluateFixedPoint(
  prev: ExecutionStateSnapshot | null,
  nextNeptune: NeptuneRepairResult,
  nextClosure: EcoNeptuneClosureEvaluation,
  options?: ConvergenceSemanticsOptions,
): ExecutionFixedPoint {
  const eps = mergeOpts(options);
  const stateHash = computeExecutionStateHash(nextNeptune, nextClosure);

  if (!prev) {
    const semanticResidual = clamp01(manifoldViolation(nextClosure));
    const isFixedPoint =
      semanticResidual <= eps.epsilonManifold && !nextClosure.shouldRerunNeptune;

    return {
      stateHash,
      residualDelta: semanticResidual,
      contractionRate: 1,
      isFixedPoint,
      iterationIndex: 1,
      convergenceConfidence: isFixedPoint ? 0.92 : 0.42,
    };
  }

  const pairwiseResidual = computeNeptuneResidualDelta(prev.neptune, nextNeptune);
  const contractionRate = pairwiseResidual < prev.residualDelta ? 1 : -1;

  const mv = manifoldViolation(nextClosure);
  const isFixedPoint =
    pairwiseResidual <= eps.epsilonResidual &&
    mv <= eps.epsilonManifold &&
    !nextClosure.shouldRerunNeptune;

  const convergenceConfidence =
    contractionRate > 0 ? (isFixedPoint ? 0.9 : 0.62) : isFixedPoint ? 0.55 : 0.28;

  return {
    stateHash,
    residualDelta: pairwiseResidual,
    contractionRate,
    isFixedPoint,
    iterationIndex: prev.iterationIndex + 1,
    convergenceConfidence,
  };
}

/** Stop-condition for contraction-based iteration: continue iff not at declared fixed point. */
export function shouldContinueIteration(fp: Pick<ExecutionFixedPoint, 'isFixedPoint'>): boolean {
  return !fp.isFixedPoint;
}
