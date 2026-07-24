import { OrToolsRepairProvider } from './ortools-repair.provider';
import { OptimizationProblemMapper } from '../mappers/optimization-problem.mapper';
import { SolverCandidateMapper } from '../mappers/solver-candidate.mapper';
import type { OrToolsSolverClient } from '../ortools-solver.client';
import type { SolverProblem } from '../contracts/solver-problem';
import type { SolverResponse } from '../contracts/solver-response';

describe('OrToolsRepairProvider', () => {
  const problem: SolverProblem = {
    schemaId: 'tripnara.solver_problem@v1',
    requestId: 'r1',
    tripId: 'trip-1',
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
        timeWindows: [{ startMin: 0, endMin: 600 }],
        isMandatory: true,
        isBooked: false,
        canRemove: false,
        canMoveDay: false,
      },
    ],
    travelMatrix: {
      nodeIds: ['depot', 'a1'],
      costsMin: [
        [0, 5],
        [5, 0],
      ],
    },
    constraints: [],
    objectives: [],
    solverConfig: { maxCandidates: 2, timeLimitMs: 200, seed: 1 },
  };

  const response: SolverResponse = {
    schemaId: 'tripnara.solver_response@v1',
    requestId: 'r1',
    status: 'SOLVED',
    candidates: [
      {
        candidateId: 'r1:swap:0',
        operation: 'SWAP',
        label: 'swap-0',
        dayPlans: [{ dayId: 'd1', nodeIds: ['depot', 'a1'], startMin: [0, 5] }],
      },
    ],
    solverMeta: {
      engine: 'OR_TOOLS_ROUTING',
      version: '0.1.0',
      strategy: 'GUIDED_LOCAL_SEARCH',
      nativeCpSat: false,
      seed: 1,
      elapsedMs: 12,
    },
  };

  const prevUrl = process.env.OR_TOOLS_SOLVER_URL;
  const prevShadow = process.env.OR_TOOLS_REPAIR_SHADOW;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.OR_TOOLS_SOLVER_URL;
    else process.env.OR_TOOLS_SOLVER_URL = prevUrl;
    if (prevShadow === undefined) delete process.env.OR_TOOLS_REPAIR_SHADOW;
    else process.env.OR_TOOLS_REPAIR_SHADOW = prevShadow;
  });

  it('returns shadow proposals from solver response', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';

    const client = {
      solve: jest.fn().mockResolvedValue(response),
    } as unknown as OrToolsSolverClient;

    const provider = new OrToolsRepairProvider(
      client,
      new OptimizationProblemMapper(),
      new SolverCandidateMapper(),
    );

    const result = await provider.proposeRepairs({
      tripId: 'trip-1',
      worldState: {} as never,
      providerContext: { ortools: { solverProblem: problem } },
    });

    expect(result.providerId).toBe('ortools-repair');
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].candidateId).toBe('r1:swap:0');
    expect(client.solve).toHaveBeenCalled();
  });

  it('does not call solver when URL unset', async () => {
    delete process.env.OR_TOOLS_SOLVER_URL;
    const client = { solve: jest.fn() } as unknown as OrToolsSolverClient;
    const provider = new OrToolsRepairProvider(
      client,
      new OptimizationProblemMapper(),
      new SolverCandidateMapper(),
    );
    const result = await provider.proposeRepairs({
      tripId: 'trip-1',
      worldState: {} as never,
      providerContext: { ortools: { solverProblem: problem } },
    });
    expect(result.proposals).toEqual([]);
    expect(client.solve).not.toHaveBeenCalled();
  });
});
