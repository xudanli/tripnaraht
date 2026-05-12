import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import { stableExecutionIrId } from '../execution-memory/stable-execution-ir-id';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionWorld } from './execution-world.types';

function overlayVariantDrift(a: string, b: string): number {
  return a === b ? 0 : 0.12;
}

/** Delay/posture drift when structural dagId still matches (defensive). */
function observationDrift(a: ExecutionTruthDAG, b: ExecutionTruthDAG): number {
  const line = (d: ExecutionTruthDAG) =>
    [...d.nodes]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map(
        n =>
          `${n.id}:${n.execution.delayMinutes}:${n.execution.finalState}:${n.execution.reliabilityScore}`,
      )
      .join('|');
  return line(a) === line(b) ? 0 : 0.08;
}

export function diffWorldToBaseline(world: ExecutionWorld, baseline: ExecutionWorld): number {
  const sameStructure = stableExecutionDagId(world.dag) === stableExecutionDagId(baseline.dag);
  const dagDrift = sameStructure ? observationDrift(world.dag, baseline.dag) : 0.45;
  const irDrift =
    stableExecutionIrId(world.ir) === stableExecutionIrId(baseline.ir) ? 0 : 0.35;
  const ovDrift = overlayVariantDrift(world.overlayVariant, baseline.overlayVariant);
  return Math.min(1, dagDrift + irDrift + ovDrift);
}

/**
 * Sets {@link ExecutionWorld.divergenceScore} vs `baseline` (defaults to first world).
 */
export function computeWorldDivergence(
  worlds: ExecutionWorld[],
  baseline?: ExecutionWorld,
): ExecutionWorld[] {
  if (!worlds.length) {
    return [];
  }
  const base = baseline ?? worlds[0]!;

  return worlds.map(w => ({
    ...w,
    divergenceScore: diffWorldToBaseline(w, base),
  }));
}
