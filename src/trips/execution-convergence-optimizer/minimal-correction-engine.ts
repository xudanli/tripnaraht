/**
 * Plans and applies minimal structural corrections before an optional second Neptune pass.
 */

import type { TripWorldState } from '../decision/world-model';
import { compileDAGToIR } from '../execution-ir/compile-dag-to-ir';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { applyGraphPatchesToDag } from '../execution-runtime/apply-graph-patches';
import { applyModelPatches } from '../causal-reflection/causal-model-rewriter';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { EcoOrchestrationResultLike } from '../execution-cognitive-orchestrator/closure-controller';
import type { NeptunePatch } from './neptune-patch.types';

export type EcoCorrectionStrategy = 'full_neptune_retry' | 'minimal_patch_then_neptune';

/** Default stays legacy full duplicate Neptune; opt into minimal via policy or `TRIP_ECO_CORRECTION_STRATEGY`. */
export function resolveCorrectionStrategy(state: TripWorldState): EcoCorrectionStrategy {
  const p = state.policies?.ecoClosure?.correctionStrategy;
  if (p === 'full_neptune_retry' || p === 'minimal_patch_then_neptune') {
    return p;
  }
  const env =
    typeof process !== 'undefined' ? process.env?.TRIP_ECO_CORRECTION_STRATEGY : undefined;
  if (env === 'minimal_patch_then_neptune' || env === 'full_neptune_retry') {
    return env;
  }
  return 'full_neptune_retry';
}

function scaleTraverseCosts(ir: ExecutionIR, factor: number): ExecutionIR {
  const steps = ir.steps.map(s =>
    s.type === 'TRAVERSE' ? { ...s, cost: Math.max(0, s.cost * factor) } : s,
  );
  return { ...ir, steps };
}

/**
 * Heuristic patch plan from closure metrics (single tick).
 * Prefers one DAG edge relaxation when stability fails; IR traverse scaling only when no DAG fix;
 * causal confidence trim when drift dominates.
 */
export function planMinimalNeptunePatches(
  state: TripWorldState,
  closureEval: EcoNeptuneClosureEvaluation,
  _ecoResult: EcoOrchestrationResultLike,
): NeptunePatch[] {
  const patches: NeptunePatch[] = [];
  const dag = state.signals.executionTruthDAG;
  const t = closureEval.thresholds;

  let plannedDag = false;

  if (closureEval.stabilityScore < t.stabilityMin && dag?.edges?.length) {
    const sorted = [...dag.edges].sort((a, b) => b.weight - a.weight);
    const victim =
      sorted.find(e => e.type === 'TEMPORAL_SEQUENCE' || e.type === 'ROUTE_DEPENDENCY') ?? sorted[0];
    if (victim) {
      patches.push({
        target: 'DAG',
        delta: [
          {
            target: victim.id,
            op: 'DECREASE_WEIGHT',
            reason: 'eco_closure:stability',
          },
        ],
        reason: 'Relax highest-stress edge after stability shortfall',
      });
      plannedDag = true;
    }
  }

  if (!plannedDag && closureEval.semanticConvergence < t.convergenceMin) {
    patches.push({
      target: 'IR',
      delta: { traverseCostScale: 0.94 },
      reason: 'Scale traverse costs after semantic divergence (no DAG patch)',
    });
  }

  if (closureEval.ecoDriftScore > t.driftMax && state.signals.reflectiveCausalModel) {
    patches.push({
      target: 'CausalModel',
      delta: [{ id: 'eco:drift_trim', metaConfidenceDelta: -0.04 }],
      reason: 'Reduce epistemic confidence after causal drift spike',
    });
  }

  return patches;
}

export interface MinimalPatchApplyOutcome {
  applied: NeptunePatch[];
  dagMutated: boolean;
  causalUpdated: boolean;
  irScaled: boolean;
}

/** Mutates `state.signals` in place; caller runs `neptuneRepairPlan` afterward if desired. */
export function applyMinimalNeptunePatches(
  state: TripWorldState,
  patches: NeptunePatch[],
): MinimalPatchApplyOutcome {
  const applied: NeptunePatch[] = [];
  let dagMutated = false;
  let causalUpdated = false;
  let irScaled = false;

  const dagPatches = patches.filter((p): p is Extract<NeptunePatch, { target: 'DAG' }> => p.target === 'DAG');
  const causalPatches = patches.filter(
    (p): p is Extract<NeptunePatch, { target: 'CausalModel' }> => p.target === 'CausalModel',
  );
  const irPatches = patches.filter((p): p is Extract<NeptunePatch, { target: 'IR' }> => p.target === 'IR');
  const overlayPatches = patches.filter(
    (p): p is Extract<NeptunePatch, { target: 'Overlay' }> => p.target === 'Overlay',
  );

  for (const p of causalPatches) {
    const cur = state.signals.reflectiveCausalModel;
    if (!cur || !p.delta.length) continue;
    state.signals.reflectiveCausalModel = applyModelPatches(cur, p.delta);
    causalUpdated = true;
    applied.push(p);
  }

  const mergedGraphPatches = dagPatches.flatMap(p => p.delta);
  if (mergedGraphPatches.length && state.signals.executionTruthDAG) {
    state.signals.executionTruthDAG = applyGraphPatchesToDag(
      state.signals.executionTruthDAG,
      mergedGraphPatches,
    );
    state.signals.executionIR = compileDAGToIR(state.signals.executionTruthDAG);
    dagMutated = true;
    for (const p of dagPatches) applied.push(p);
  }

  if (!dagMutated) {
    for (const p of irPatches) {
      const ir = state.signals.executionIR;
      if (!ir) continue;
      state.signals.executionIR = scaleTraverseCosts(ir, p.delta.traverseCostScale);
      irScaled = true;
      applied.push(p);
    }
  }

  for (const p of overlayPatches) {
    const note = `${p.reason}: ${p.delta.auditNote}`;
    state.signals.alerts = [
      ...(state.signals.alerts ?? []),
      { code: 'ECO_MINIMAL_PATCH', severity: 'info' as const, message: note },
    ];
    applied.push(p);
  }

  return { applied, dagMutated, causalUpdated, irScaled };
}
