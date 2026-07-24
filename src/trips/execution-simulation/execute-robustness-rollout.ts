/**
 * Unified Robustness Rollout engine — physical (executeSimulation) + organizational (social stress).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionVMContext } from '../execution-vm/execution-vm';
import {
  evaluateStepStress,
  isOrganizationalFailure,
} from '../causal-physics/social-stress-engine';
import { executeSimulation } from './execute-simulation';
import { buildRobustnessVariants, perturbationTagsForVariant } from './build-robustness-variants.util';
import { extractRolloutNodeContexts } from './extract-rollout-nodes.util';
import type {
  EnhancedSimulationPlan,
  RobustnessRolloutResult,
} from './robustness-rollout.types';
import {
  aggregateRobustnessRollout,
  type PerSampleSocialTrace,
  type PhysicalSampleOutcome,
} from './rollout-scorer.util';

export interface RobustnessRolloutContext extends ExecutionVMContext {
  witnessDag: ExecutionTruthDAG;
}

/**
 * Run N deterministic perturbation rollouts with dual robustness scoring.
 * Requires witness DAG for node-level social stress propagation.
 */
export function executeRobustnessRollout(
  plan: EnhancedSimulationPlan,
  context: RobustnessRolloutContext,
): RobustnessRolloutResult {
  const variants = buildRobustnessVariants(plan.simulationConfig);
  const nodeContexts = extractRolloutNodeContexts(context.witnessDag);
  const threshold =
    plan.simulationConfig.organizationalStressThreshold ?? undefined;

  const vmContext: ExecutionVMContext = {
    witnessDag: context.witnessDag,
    mode: context.mode ?? 'SIMULATION',
  };

  const runs = executeSimulation(
    { baseIR: plan.baseIR, variants },
    vmContext,
  );

  const physicalOutcomes: PhysicalSampleOutcome[] = runs.map(run => ({
    variantId: run.variantId,
    run,
    physicalPass: false,
    perturbationTags: perturbationTagsForVariant(
      run.variant,
      plan.simulationConfig.enabledPerturbations,
    ),
  }));

  const socialTraces: PerSampleSocialTrace[] = runs.map(run => {
    const p = run.variant.perturbation;
    const weatherBoost = 1 + (p.weatherShift ?? 0) * 0.8;
    const delayBoost = 1 + (p.delayBias ?? 0) * 0.5;

    const nodeStress: PerSampleSocialTrace['nodeStress'] = [];
    let peakSocialStress = 0;

    for (const ctx of nodeContexts) {
      const adjustedDuration = ctx.durationMinutes * delayBoost;
      const weatherSeverity = clamp01(ctx.weatherSeverity * weatherBoost);
      const { socialStress } = evaluateStepStress(
        {
          nodeId: ctx.nodeId,
          durationMinutes: adjustedDuration,
          elevationGainM: ctx.elevationGainM,
          weatherSeverity,
        },
        plan.party,
      );
      nodeStress.push({ nodeId: ctx.nodeId, socialStress });
      peakSocialStress = Math.max(peakSocialStress, socialStress);
    }

    const organizationalPass = !isOrganizationalFailure(peakSocialStress);

    return {
      variantId: run.variantId,
      nodeStress,
      peakSocialStress,
      organizationalPass,
      perturbationTags: perturbationTagsForVariant(
        run.variant,
        plan.simulationConfig.enabledPerturbations,
      ),
    };
  });

  return aggregateRobustnessRollout({
    nodeContexts,
    physicalOutcomes,
    socialTraces,
    baseIR: plan.baseIR,
    organizationalStressThreshold: threshold,
  });
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
