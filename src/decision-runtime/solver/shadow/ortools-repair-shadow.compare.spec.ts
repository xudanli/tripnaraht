import {
  buildOrToolsRepairShadowReport,
  countForbiddenEdgeViolations,
} from './ortools-repair-shadow.compare';
import type { SolverProblem } from '../contracts/solver-problem';
import type { SolverResponse } from '../contracts/solver-response';

function baseProblem(): SolverProblem {
  return {
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
        timeWindows: [{ startMin: 0, endMin: 600 }],
        isMandatory: true,
        isBooked: false,
        canRemove: false,
        canMoveDay: false,
      },
      {
        nodeId: 'a2',
        serviceDurationMin: 30,
        timeWindows: [{ startMin: 0, endMin: 600 }],
        isMandatory: true,
        isBooked: false,
        canRemove: false,
        canMoveDay: false,
      },
    ],
    travelMatrix: {
      nodeIds: ['depot', 'a1', 'a2'],
      costsMin: [
        [0, 10, 10],
        [10, 0, 10],
        [10, 10, 0],
      ],
    },
    constraints: [
      {
        constraintId: 'e1',
        kind: 'EDGE_FORBIDDEN',
        hard: true,
        canonicalConstraintId: 'road.close.F208',
        payload: { fromNodeId: 'a1', toNodeId: 'a2' },
      },
    ],
    objectives: [],
    solverConfig: { maxCandidates: 3, timeLimitMs: 500, seed: 1 },
  };
}

describe('ortools-repair-shadow.compare', () => {
  it('counts forbidden edge violations', () => {
    const n = countForbiddenEdgeViolations(
      [
        {
          candidateId: 'c1',
          operation: 'SWAP',
          label: 'x',
          dayPlans: [{ dayId: 'd1', nodeIds: ['depot', 'a1', 'a2'] }],
        },
      ],
      [{ fromNodeId: 'a1', toNodeId: 'a2' }],
    );
    expect(n).toBe(1);
  });

  it('builds report with writeAttempted=false and gatewayRequired=true', () => {
    const problem = baseProblem();
    const solverResponse: SolverResponse = {
      schemaId: 'tripnara.solver_response@v1',
      requestId: 'r1',
      status: 'SOLVED',
      candidates: [
        {
          candidateId: 'c1',
          operation: 'SWAP',
          label: 'ok',
          dayPlans: [{ dayId: 'd1', nodeIds: ['depot', 'a2', 'a1'] }],
        },
      ],
      solverMeta: {
        engine: 'OR_TOOLS_ROUTING',
        version: '0.1.0',
        strategy: 'GUIDED_LOCAL_SEARCH',
        nativeCpSat: false,
        seed: 1,
        elapsedMs: 40,
      },
    };

    const report = buildOrToolsRepairShadowReport({
      tripId: 't1',
      requestId: 'r1',
      authorityProviderId: 'neptune-repair',
      authority: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'neptune-repair',
        tripId: 't1',
        proposals: [{ proposalId: 'auth-1', candidateId: 'auth-1' }],
        generatedAt: new Date().toISOString(),
      },
      shadow: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'ortools-repair',
        tripId: 't1',
        proposals: [{ proposalId: 'c1', candidateId: 'c1' }],
        generatedAt: new Date().toISOString(),
      },
      problem,
      solverResponse,
    });

    expect(report.writeAttempted).toBe(false);
    expect(report.gatewayRequired).toBe(true);
    expect(report.forbiddenEdgeViolations).toBe(0);
    expect(report.shadowNativeCpSat).toBe(false);
    expect(report.authorityProposalCount).toBe(1);
    expect(report.shadowProposalCount).toBe(1);
  });
});
