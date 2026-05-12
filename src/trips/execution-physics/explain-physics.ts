import type { ExecutionPhysicsModel, PhysicsDriftSignal } from './execution-physics.types';

/** Neptune / audit: interpret physics deltas vs prior baseline (caller supplies baseline). */
export function explainPhysicsInterpretation(
  model: ExecutionPhysicsModel,
  drifts: PhysicsDriftSignal[],
): string[] {
  const lines: string[] = [
    `Physics v${model.version}: time=${model.timeModel.type}/${model.timeModel.driftBehavior}; causality=${model.causalityModel}; constraints=${model.constraints}; collapse=${model.stateTransitionModel.defaultCollapse}`,
  ];
  for (const d of drifts) {
    lines.push(`Drift ${d.kind} (sev=${d.severity.toFixed(2)}): ${d.detail}`);
  }
  return lines;
}
