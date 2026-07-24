import { OrToolsRoadEvaluateShadowBridge } from './ortools-road-evaluate-shadow.bridge';
import type { OrToolsSolverClient } from '../ortools-solver.client';
import type { ConstraintEvaluationGatewayService } from '../../constraints/constraint-evaluation.gateway.service';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';

describe('OrToolsRoadEvaluateShadowBridge', () => {
  const prevUrl = process.env.OR_TOOLS_SOLVER_URL;
  const prevShadow = process.env.OR_TOOLS_REPAIR_SHADOW;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.OR_TOOLS_SOLVER_URL;
    else process.env.OR_TOOLS_SOLVER_URL = prevUrl;
    if (prevShadow === undefined) delete process.env.OR_TOOLS_REPAIR_SHADOW;
    else process.env.OR_TOOLS_REPAIR_SHADOW = prevShadow;
  });

  const plan: RoutePlanDraft = {
    tripId: 'trip-1',
    routeDirectionId: 'rd',
    segments: [
      {
        segmentId: 's1',
        dayIndex: 0,
        distanceKm: 20,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a1', poiId: 'p1', roadIds: ['F208'] },
      },
      {
        segmentId: 's2',
        dayIndex: 0,
        distanceKm: 22,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a2', poiId: 'p2', roadIds: ['F208'] },
      },
      {
        segmentId: 's3',
        dayIndex: 0,
        distanceKm: 18,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a3', poiId: 'p3' },
      },
    ],
  };

  const impact: RoadCloseImpactResult = {
    roadId: 'F208',
    matchedSegmentIds: ['s1'],
    affectedPlanItemIds: ['a1'],
    affectedEntityRefs: [],
    downstreamItemIds: [],
    matchedSegments: [],
  };

  const problem = {
    problemId: 'prob-1',
    planVersionId: 'pv-1',
    worldStateSnapshotId: 'snap-1',
  } as Rfc001DecisionProblem;

  it('returns null when shadow URL unset', async () => {
    delete process.env.OR_TOOLS_SOLVER_URL;
    const bridge = new OrToolsRoadEvaluateShadowBridge(
      { solve: jest.fn() } as unknown as OrToolsSolverClient,
    );
    const out = await bridge.run({
      tripId: 'trip-1',
      workspaceId: 'ws-1',
      problem,
      impact,
      basePlan: plan,
      neptuneCandidates: [],
    });
    expect(out).toBeNull();
  });

  it('materializes TripPlan path through Gateway and keeps shadowAuthority=false', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';

    const client = {
      solve: jest.fn().mockResolvedValue({
        schemaId: 'tripnara.solver_response@v1',
        requestId: 'r1',
        status: 'SOLVED',
        candidates: [
          {
            candidateId: 'ortools:0',
            operation: 'SWAP',
            label: 'swap-0',
            dayPlans: [
              {
                dayId: 'day-0',
                // avoid a1→a2 consecutive (F208 forbidden hop in base order)
                nodeIds: ['depot', 'a1', 'a3', 'a2'],
                startMin: [480, 500, 580, 660],
              },
            ],
          },
        ],
        solverMeta: {
          engine: 'OR_TOOLS_ROUTING',
          version: 'test',
          strategy: 'GUIDED_LOCAL_SEARCH',
          nativeCpSat: false,
          seed: 42,
          elapsedMs: 12,
        },
      }),
    } as unknown as OrToolsSolverClient;

    const gateway = {
      evaluateCandidate: jest.fn().mockResolvedValue({
        overallStatus: 'PASS',
        degraded: false,
        assertions: [{ assertionId: 'x' }],
      }),
    } as unknown as ConstraintEvaluationGatewayService;

    const bridge = new OrToolsRoadEvaluateShadowBridge(client, gateway);
    const out = await bridge.run({
      tripId: 'trip-1',
      workspaceId: 'ws-1',
      problem,
      impact,
      basePlan: plan,
      neptuneCandidates: [
        {
          candidateId: 'cand_a',
        } as never,
      ],
      bindings: { byItemId: { a1: ['F208'] } },
    });

    expect(out).not.toBeNull();
    expect(out!.shadowAuthority).toBe(false);
    expect(out!.report.writeAttempted).toBe(false);
    expect(out!.report.gatewayRequired).toBe(true);
    expect(out!.neptuneCandidateCount).toBe(1);
    expect(out!.shadowCandidateCount).toBe(1);
    expect(out!.shadowRepairCandidates[0].proposedOperations[0].kind).toBe(
      'MOVE_ITEM',
    );
    expect(gateway.evaluateCandidate).toHaveBeenCalled();
    expect(out!.gatewayByCandidateId['ortools:0'].overallStatus).toBe('PASS');
  });

  it('falls back to SHORTEN when primary solve returns empty candidates', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';

    const solve = jest
      .fn()
      .mockResolvedValueOnce({
        schemaId: 'tripnara.solver_response@v1',
        requestId: 'r1',
        status: 'TIMEOUT',
        candidates: [],
        solverMeta: {
          engine: 'OR_TOOLS_ROUTING',
          version: 'test',
          strategy: 'GUIDED_LOCAL_SEARCH',
          nativeCpSat: false,
          seed: 42,
          elapsedMs: 50,
        },
      })
      .mockResolvedValueOnce({
        schemaId: 'tripnara.solver_response@v1',
        requestId: 'r1:shorten',
        status: 'SOLVED',
        candidates: [
          {
            candidateId: 'ortools:shorten:0',
            operation: 'SHORTEN',
            label: 'shorten-a1-75pct',
            dayPlans: [
              {
                dayId: 'day-0',
                nodeIds: ['depot', 'a1', 'a3', 'a2'],
                startMin: [480, 500, 580, 660],
              },
            ],
          },
        ],
        solverMeta: {
          engine: 'OR_TOOLS_ROUTING',
          version: 'test',
          strategy: 'SHORTEN_LOCAL',
          nativeCpSat: false,
          seed: 42,
          elapsedMs: 5,
        },
      });

    const bridge = new OrToolsRoadEvaluateShadowBridge({
      solve,
    } as unknown as OrToolsSolverClient);

    const out = await bridge.run({
      tripId: 'trip-1',
      workspaceId: 'ws-1',
      problem,
      impact,
      basePlan: plan,
      neptuneCandidates: [],
      bindings: { byItemId: { a1: ['F208'] } },
    });

    expect(solve).toHaveBeenCalledTimes(2);
    expect(solve.mock.calls[1][0].operation).toBe('SHORTEN');
    expect(out!.shadowAuthority).toBe(false);
    expect(out!.shadowCandidateCount).toBe(1);
    expect(out!.shadowRepairCandidates[0].candidateId).toBe(
      'ortools:shorten:0',
    );
  });

  it('falls back to REPLACE when SHORTEN also empty', async () => {
    process.env.OR_TOOLS_SOLVER_URL = 'http://127.0.0.1:8091';
    process.env.OR_TOOLS_REPAIR_SHADOW = '1';

    const empty = {
      schemaId: 'tripnara.solver_response@v1' as const,
      status: 'TIMEOUT' as const,
      candidates: [],
      solverMeta: {
        engine: 'OR_TOOLS_ROUTING' as const,
        version: 'test',
        strategy: 'GUIDED_LOCAL_SEARCH',
        nativeCpSat: false,
        seed: 42,
        elapsedMs: 10,
      },
    };
    const solve = jest
      .fn()
      .mockResolvedValueOnce({ ...empty, requestId: 'r1' })
      .mockResolvedValueOnce({ ...empty, requestId: 'r1:shorten' })
      .mockResolvedValueOnce({
        ...empty,
        requestId: 'r1:replace',
        status: 'SOLVED',
        candidates: [
          {
            candidateId: 'ortools:replace:0',
            operation: 'REPLACE',
            label: 'replace-a1',
            dayPlans: [
              {
                dayId: 'day-0',
                nodeIds: ['depot', 'alt:a1', 'a3', 'a2'],
                startMin: [480, 500, 580, 660],
              },
            ],
            diffHint: {
              removedActivityIds: ['a1'],
              addedPoiIds: ['p1-alt'],
            },
          },
        ],
      });

    const bridge = new OrToolsRoadEvaluateShadowBridge({
      solve,
    } as unknown as OrToolsSolverClient);

    const out = await bridge.run({
      tripId: 'trip-1',
      workspaceId: 'ws-1',
      problem,
      impact,
      basePlan: plan,
      neptuneCandidates: [],
      bindings: { byItemId: { a1: ['F208'] } },
    });

    expect(solve).toHaveBeenCalledTimes(3);
    expect(solve.mock.calls[2][0].operation).toBe('REPLACE');
    expect(out!.shadowCandidateCount).toBe(1);
    expect(out!.shadowRepairCandidates[0].proposedOperations.some((o) => o.kind === 'REPLACE_ITEM')).toBe(
      true,
    );
    expect(out!.evidenceVersionId).toBe('snap-1');
  });
});
