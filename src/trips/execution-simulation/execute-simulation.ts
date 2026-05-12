/**
 * P10 — run N deterministic bytecode simulations from one base IR.
 */

import type { ExecutionVMContext } from '../execution-vm/execution-vm';
import { runExecutionIRAsVm } from '../execution-vm/execution-vm';
import { applyPerturbation } from './apply-perturbation';
import type {
  ExecutionSimulationPlan,
  ExecutionSimulationRunResult,
} from './execution-simulation.types';

export function executeSimulation(
  plan: ExecutionSimulationPlan,
  vmContext: ExecutionVMContext,
): ExecutionSimulationRunResult[] {
  const ids = new Set<string>();
  for (const v of plan.variants) {
    if (ids.has(v.id)) {
      throw new Error(`executionSimulation duplicate variant id: ${v.id}`);
    }
    ids.add(v.id);
  }

  const results: ExecutionSimulationRunResult[] = [];

  for (const variant of plan.variants) {
    const mutatedIR = applyPerturbation(plan.baseIR, variant);
    const bundle = runExecutionIRAsVm(mutatedIR, vmContext);
    results.push({
      variantId: variant.id,
      variant,
      irRun: bundle.irRun,
      outcome: bundle.outcome,
      program: bundle.program,
    });
  }

  return results;
}
