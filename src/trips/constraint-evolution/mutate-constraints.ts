import type { ConstraintGene, ConstraintPopulation } from './constraint-genome.types';

function clampWeight(x: number): number {
  if (x < 0.05) {
    return 0.05;
  }
  if (x > 1) {
    return 1;
  }
  return x;
}

/** Deterministic jitter in [-1,1] from gene id + generation (reproducible). */
function deterministicJitter(geneId: string, generation: number): number {
  const key = `${geneId}@${generation}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = (h >>> 0) / 0xffff_ffff;
  return u * 2 - 1;
}

export function adjustWeight(g: ConstraintGene, generation: number): number {
  const jitter = deterministicJitter(g.id, generation) * g.mutationRate;
  return clampWeight(g.weight + jitter);
}

export function mutateConstraints(population: ConstraintPopulation): ConstraintPopulation {
  const nextGen = population.generation + 1;
  const genes = population.genes.map(g => ({
    ...g,
    weight: adjustWeight(g, nextGen),
  }));
  return {
    generation: nextGen,
    genes,
    fitness: population.fitness,
  };
}
