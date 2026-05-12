/**
 * Expands kernel seeds into a candidate lattice via deterministic mutations.
 */

import type { ExecutionPhysicsModel } from '../execution-physics/execution-physics.types';
import type { MetaRealityKernel, RealitySeed } from './meta-reality-kernel.types';

const TIME_ROTATION = ['LINEAR_TIME', 'SEGMENTED_TIME', 'RELATIVE_TIME', 'CAUSAL_TIME'] as const;
const DRIFT_ROTATION = ['ACCUMULATIVE', 'RESET_ON_BRANCH', 'CONTEXTUAL_REBASE'] as const;
const CAUSAL_ROTATION = ['STRICT_CHAIN', 'DAG_CAUSALITY', 'PROBABILISTIC_CAUSALITY'] as const;
const CONSTRAINT_ROTATION = [
  'STRICT_SEQUENTIAL',
  'PARTIAL_ORDER',
  'PROBABILISTIC_CAUSALITY',
  'MULTI_WORLD_BRANCHING',
] as const;

function idxRotate<T extends string>(arr: readonly T[], shift: number): T {
  return arr[shift % arr.length]!;
}

function clonePhysics(model: ExecutionPhysicsModel): ExecutionPhysicsModel {
  return {
    ...model,
    timeModel: { ...model.timeModel },
    stateTransitionModel: { ...model.stateTransitionModel },
  };
}

export function mutateTimePhysics(base: RealitySeed, variantIndex: number): RealitySeed {
  const shift = variantIndex + 1;
  const nextTime = {
    type: idxRotate(TIME_ROTATION, shift),
    driftBehavior: idxRotate(DRIFT_ROTATION, shift + 1),
  };
  const exec = clonePhysics(base.executionSemantics);
  exec.timeModel = nextTime;

  return {
    ...base,
    seedId: `${base.seedId}__mut_time_${variantIndex}`,
    timePhysics: nextTime,
    executionSemantics: exec,
    probabilityWeight: base.probabilityWeight * 0.92,
  };
}

export function mutateCausality(base: RealitySeed, variantIndex: number): RealitySeed {
  const shift = variantIndex + 2;
  const nextCausal = idxRotate(CAUSAL_ROTATION, shift);
  const exec = clonePhysics(base.executionSemantics);
  exec.causalityModel = nextCausal;

  return {
    ...base,
    seedId: `${base.seedId}__mut_causal_${variantIndex}`,
    causalityPhysics: nextCausal,
    executionSemantics: exec,
    probabilityWeight: base.probabilityWeight * 0.9,
  };
}

export function mutateExecutionSemantics(base: RealitySeed, variantIndex: number): RealitySeed {
  const shift = variantIndex;
  const exec = clonePhysics(base.executionSemantics);
  exec.constraints = idxRotate(CONSTRAINT_ROTATION, shift + exec.version.length);
  exec.version = `${exec.version}+boot`;

  return {
    ...base,
    seedId: `${base.seedId}__mut_exec_${variantIndex}`,
    executionSemantics: exec,
    probabilityWeight: base.probabilityWeight * 0.88,
  };
}

export function normalizeProbabilities(seeds: RealitySeed[]): RealitySeed[] {
  const sum = seeds.reduce((a, s) => a + Math.max(0, s.probabilityWeight), 0);
  if (sum <= 0) {
    const eq = seeds.length ? 1 / seeds.length : 0;
    return seeds.map(s => ({ ...s, probabilityWeight: eq }));
  }
  return seeds.map(s => ({
    ...s,
    probabilityWeight: Math.max(0, s.probabilityWeight) / sum,
  }));
}

export function generateRealityCandidates(kernel: MetaRealityKernel): RealitySeed[] {
  const out: RealitySeed[] = [];

  kernel.realitySeeds.forEach((base, i) => {
    out.push(mutateTimePhysics(base, i));
    out.push(mutateCausality(base, i));
    out.push(mutateExecutionSemantics(base, i));
  });

  return normalizeProbabilities(out);
}
