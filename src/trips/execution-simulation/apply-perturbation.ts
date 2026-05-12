/**
 * Deterministic IR perturbation for counterfactual VM runs — structural steps unchanged, TRAVERSE costs scaled.
 */

import type { ExecutionIR, ExecutionIRStep } from '../execution-ir/execution-ir.types';
import type { ExecutionVariant } from './execution-simulation.types';

function strategyMultiplier(
  strategy: ExecutionVariant['perturbation']['repairStrategy'] | undefined,
): number {
  switch (strategy) {
    case 'conservative':
      return 0.92;
    case 'aggressive':
      return 1.12;
    case 'minimal':
    case undefined:
    default:
      return 1;
  }
}

function traversalFactor(variant: ExecutionVariant): number {
  const p = variant.perturbation;
  const w = p.weatherShift ?? 0;
  const r = p.roadNoise ?? 0;
  const d = p.delayBias ?? 0;
  const strat = strategyMultiplier(p.repairStrategy);
  return (1 + w + r + d) * strat;
}

export function cloneExecutionIR(ir: ExecutionIR): ExecutionIR {
  return JSON.parse(JSON.stringify(ir)) as ExecutionIR;
}

/**
 * Clone IR and scale **TRAVERSE** costs — CHECK / PROJECT / PATCH unchanged (structure-preserving).
 */
export function applyPerturbation(baseIR: ExecutionIR, variant: ExecutionVariant): ExecutionIR {
  const factor = traversalFactor(variant);
  const next: ExecutionIR = cloneExecutionIR(baseIR);

  next.steps = next.steps.map((step: ExecutionIRStep) => {
    if (step.type === 'TRAVERSE') {
      return {
        ...step,
        cost: step.cost * factor,
      };
    }
    return step;
  });

  return next;
}
