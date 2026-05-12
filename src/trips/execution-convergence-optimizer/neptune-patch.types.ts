/**
 * P-ECO-Closure-2 — Minimal delta repair units (no full cognitive recompute).
 */

import type { ExecutionGraphPatch } from '../execution-truth-dag/build-graph-patches';
import type { ModelPatch } from '../causal-reflection/causal-model.types';

export type NeptunePatchTarget = 'DAG' | 'IR' | 'CausalModel' | 'Overlay';

/**
 * One logical patch bundle. Apply order is owned by {@link applyMinimalNeptunePatches}.
 */
export type NeptunePatch =
  | { target: 'DAG'; delta: ExecutionGraphPatch[]; reason: string }
  | { target: 'IR'; delta: { traverseCostScale: number }; reason: string }
  | { target: 'CausalModel'; delta: ModelPatch[]; reason: string }
  | { target: 'Overlay'; delta: { auditNote: string }; reason: string };
