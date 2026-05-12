import type { ExecutionMemoryGraph } from '../execution-memory/execution-memory.types';
import { evaluateConstraintFitness } from './evaluate-constraint-fitness';
import { evolveConstraintSystem } from './evolve-constraint-system';
import type { ConstraintPopulation } from './constraint-genome.types';

function emptyMemory(): ExecutionMemoryGraph {
  return { events: [], snapshots: [] };
}

describe('constraint-evolution (P15-B)', () => {
  it('evaluateConstraintFitness returns three axes', () => {
    const pop: ConstraintPopulation = {
      generation: 0,
      fitness: 0,
      genes: [
        {
          id: 'g1',
          type: 'ROAD_RULE',
          expression: 'road.accessibility>=0',
          weight: 0.8,
          mutationRate: 0.05,
        },
      ],
    };
    const f = evaluateConstraintFitness(pop, emptyMemory());
    expect(f.feasibilityScore).toBeGreaterThan(0);
    expect(f.userSatisfaction).toBeGreaterThanOrEqual(0);
    expect(f.executionStability).toBeGreaterThanOrEqual(0);
  });

  it('evolveConstraintSystem mutates when feasibility is low', () => {
    const pop: ConstraintPopulation = {
      generation: 0,
      fitness: 0,
      genes: [
        {
          id: 'g1',
          type: 'TEMPORAL_RULE',
          expression: 'daylight.safe',
          weight: 0.2,
          mutationRate: 0.2,
        },
      ],
    };
    const next = evolveConstraintSystem(pop, emptyMemory());
    expect(next.generation).toBe(1);
  });
});
