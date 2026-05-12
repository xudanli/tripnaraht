import type { ExecutionMemoryGraph } from '../execution-memory/execution-memory.types';
import type { ConstraintFitnessBreakdown, ConstraintPopulation } from './constraint-genome.types';

function clamp01(x: number): number {
  if (x < 0) {
    return 0;
  }
  if (x > 1) {
    return 1;
  }
  return x;
}

export function computeFeasibility(population: ConstraintPopulation): number {
  if (!population.genes.length) {
    return 0;
  }
  const meanW =
    population.genes.reduce((a, g) => a + clamp01(g.weight), 0) / population.genes.length;
  return clamp01(meanW);
}

export function computeSatisfaction(memoryGraph: ExecutionMemoryGraph): number {
  const events = memoryGraph.events;
  if (!events.length) {
    return 0.55;
  }
  const neptune = events.filter(e => e.type === 'NEPTUNE_DECISION');
  if (!neptune.length) {
    return 0.62;
  }
  let pressure = 0;
  for (const e of neptune) {
    const p = e.payload as { triggerCount?: number } | null;
    const t = typeof p?.triggerCount === 'number' ? p.triggerCount : 0;
    pressure += Math.min(1, t / 12);
  }
  const avg = pressure / neptune.length;
  return clamp01(1 - avg);
}

export function computeStability(memoryGraph: ExecutionMemoryGraph): number {
  if (!memoryGraph.snapshots.length) {
    return 0.5;
  }
  let ok = 0;
  for (const s of memoryGraph.snapshots) {
    const proof = s.state.proof;
    if (!proof || proof.globalStatus !== 'INFEASIBLE') {
      ok += 1;
    }
  }
  return clamp01(ok / memoryGraph.snapshots.length);
}

export function evaluateConstraintFitness(
  population: ConstraintPopulation,
  memoryGraph: ExecutionMemoryGraph,
): ConstraintFitnessBreakdown {
  return {
    feasibilityScore: computeFeasibility(population),
    userSatisfaction: computeSatisfaction(memoryGraph),
    executionStability: computeStability(memoryGraph),
  };
}
