import {
  inferForbiddenEdgesFromClosedRoad,
  projectRoadCloseToSolverProblem,
} from './road-close-solver-problem.projector';

describe('projectRoadCloseToSolverProblem', () => {
  const stops = [
    {
      nodeId: 'depot',
      serviceDurationMin: 0,
      isDepot: true,
      timeWindow: { startMin: 480, endMin: 480 },
      fixedStartMin: 480,
    },
    { nodeId: 'a1', serviceDurationMin: 60, poiId: 'p1' },
    { nodeId: 'a2', serviceDurationMin: 60, poiId: 'p2' },
    { nodeId: 'a3', serviceDurationMin: 45, poiId: 'p3' },
  ];

  const matrix = [
    [0, 20, 40, 30],
    [20, 0, 15, 25],
    [40, 15, 0, 12],
    [30, 25, 12, 0],
  ];

  it('projects EDGE_FORBIDDEN with canonicalConstraintId', () => {
    const problem = projectRoadCloseToSolverProblem({
      requestId: 'req-1',
      tripId: 'trip-is',
      planVersionId: 'pv-1',
      evidenceVersionId: 'ev-road-f208',
      dayId: 'day-1',
      stops,
      travelMatrixMin: matrix,
      forbiddenEdges: [
        {
          fromNodeId: 'a1',
          toNodeId: 'a2',
          roadId: 'F208',
          canonicalConstraintId: 'road.close.F208',
        },
      ],
    });

    expect(problem.schemaId).toBe('tripnara.solver_problem@v1');
    expect(problem.operation).toBe('SWAP');
    const edge = problem.constraints.find((c) => c.kind === 'EDGE_FORBIDDEN');
    expect(edge?.canonicalConstraintId).toBe('road.close.F208');
    expect(edge?.payload).toMatchObject({
      fromNodeId: 'a1',
      toNodeId: 'a2',
      roadId: 'F208',
    });
    expect(problem.constraints.some((c) => c.kind === 'DEPOT_FIXED')).toBe(true);
  });

  it('infers closed hops from day order', () => {
    const edges = inferForbiddenEdgesFromClosedRoad({
      roadId: 'F208',
      orderedNodeIds: ['depot', 'a1', 'a2', 'a3'],
      closedHopIndices: [1],
    });
    expect(edges).toEqual([
      { fromNodeId: 'a1', toNodeId: 'a2', roadId: 'F208' },
    ]);
  });
});
