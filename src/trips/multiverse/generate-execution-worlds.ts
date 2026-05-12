import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionWorld } from './execution-world.types';
import { mutateDag } from './dag-clone';

export function selectOverlayVariant(
  overlayFrames: ExecutionOverlayFrame[] | undefined,
  index: number,
): string {
  if (!overlayFrames?.length) {
    return `overlay:default`;
  }
  const slot = index % overlayFrames.length;
  const id = overlayFrames[slot]?.legId ?? `idx${slot}`;
  return `overlay:${id}`;
}

export function generateExecutionWorlds(
  baseDag: ExecutionTruthDAG,
  overlayFrames: ExecutionOverlayFrame[] | undefined,
  n = 5,
): ExecutionWorld[] {
  const worlds: ExecutionWorld[] = [];
  const p = n > 0 ? 1 / n : 0;

  for (let i = 0; i < n; i++) {
    const dag = mutateDag(baseDag, i);
    worlds.push({
      worldId: `w${i}`,
      dag,
      ir: compileDAGToIR(dag),
      overlayVariant: selectOverlayVariant(overlayFrames, i),
      probability: p,
      divergenceScore: 0,
    });
  }

  return worlds;
}
