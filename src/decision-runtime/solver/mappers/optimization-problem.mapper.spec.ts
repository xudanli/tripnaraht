import { OptimizationProblemMapper } from './optimization-problem.mapper';
import type { SolverProblem } from '../contracts/solver-problem';

describe('OptimizationProblemMapper', () => {
  const mapper = new OptimizationProblemMapper();

  const base: SolverProblem = {
    schemaId: 'tripnara.solver_problem@v1',
    requestId: 'r1',
    tripId: 't1',
    planVersionId: 'pv1',
    operation: 'SWAP',
    scope: { dayIds: ['d1'] },
    nodes: [
      {
        nodeId: 'depot',
        serviceDurationMin: 0,
        timeWindows: [{ startMin: 0, endMin: 0 }],
        isMandatory: true,
        isBooked: true,
        canRemove: false,
        canMoveDay: false,
      },
      {
        nodeId: 'a1',
        serviceDurationMin: 30,
        timeWindows: [{ startMin: 60, endMin: 480 }],
        isMandatory: true,
        isBooked: false,
        canRemove: false,
        canMoveDay: false,
      },
    ],
    travelMatrix: {
      nodeIds: ['depot', 'a1'],
      costsMin: [
        [0, 10],
        [10, 0],
      ],
    },
    constraints: [],
    objectives: [],
    solverConfig: { maxCandidates: 3, timeLimitMs: 500, seed: 1 },
  };

  it('reads nested solverProblem', () => {
    const problem = mapper.fromProviderContext({ ortools: { solverProblem: base } });
    expect(problem?.requestId).toBe('r1');
  });

  it('rejects MOVE_DAY when flag off', () => {
    delete process.env.OR_TOOLS_MOVE_DAY_SHADOW;
    const problem = mapper.fromProviderContext({
      ortools: {
        solverProblem: {
          ...base,
          operation: 'MOVE_DAY',
          scope: { dayIds: ['d1', 'd2'] },
        },
      },
    });
    expect(problem).toBeNull();
  });

  it('accepts MOVE_DAY when flag on and dayIds>=2', () => {
    process.env.OR_TOOLS_MOVE_DAY_SHADOW = '1';
    const problem = mapper.fromProviderContext({
      ortools: {
        solverProblem: {
          ...base,
          operation: 'MOVE_DAY',
          scope: { dayIds: ['d1', 'd2'] },
        },
      },
    });
    expect(problem?.operation).toBe('MOVE_DAY');
    delete process.env.OR_TOOLS_MOVE_DAY_SHADOW;
  });

  it('returns null without context', () => {
    expect(mapper.fromProviderContext(undefined)).toBeNull();
  });
});
