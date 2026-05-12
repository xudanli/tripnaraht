/**
 * P15-B：以 P13 记忆为 fitness 信号、对基因权重做有界确定性变异（非在线学习）。
 */

import type { ExecutionMemoryGraph } from '../execution-memory/execution-memory.types';
import { evaluateConstraintFitness } from './evaluate-constraint-fitness';
import type { ConstraintPopulation } from './constraint-genome.types';
import { mutateConstraints } from './mutate-constraints';

export function evolveConstraintSystem(
  population: ConstraintPopulation,
  memory: ExecutionMemoryGraph,
): ConstraintPopulation {
  const fitness = evaluateConstraintFitness(population, memory);
  const aggregate =
    (fitness.feasibilityScore + fitness.userSatisfaction + fitness.executionStability) / 3;

  if (fitness.feasibilityScore < 0.7) {
    const mutated = mutateConstraints({ ...population, fitness: aggregate });
    const f2 = evaluateConstraintFitness(mutated, memory);
    const agg2 = (f2.feasibilityScore + f2.userSatisfaction + f2.executionStability) / 3;
    return { ...mutated, fitness: agg2 };
  }

  return { ...population, fitness: aggregate };
}
