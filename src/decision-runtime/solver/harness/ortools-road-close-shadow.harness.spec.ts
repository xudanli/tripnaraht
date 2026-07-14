/**
 * ADR-008 S2 harness — road close projection → OR-Tools → shadow policy checks.
 *
 * Live solver: set OR_TOOLS_SOLVER_URL (default http://127.0.0.1:8091 when reachable).
 * Without solver: projector + offline policy asserts still run.
 */

import {
  inferForbiddenEdgesFromClosedRoad,
  projectRoadCloseToSolverProblem,
} from '../projection/road-close-solver-problem.projector';
import {
  buildOrToolsRepairShadowReport,
  countForbiddenEdgeViolations,
} from '../shadow/ortools-repair-shadow.compare';
import type { SolverResponse } from '../contracts/solver-response';
import { OrToolsSolverClient } from '../ortools-solver.client';
import { isOrtToolsShadowEvidenceStale } from '../lab/ortools-shadow-evidence-freshness.util';

const DEFAULT_URL = 'http://127.0.0.1:8091';

async function solveLive(
  body: unknown,
): Promise<SolverResponse | null> {
  const prev = process.env.OR_TOOLS_SOLVER_URL;
  if (!process.env.OR_TOOLS_SOLVER_URL) {
    process.env.OR_TOOLS_SOLVER_URL = DEFAULT_URL;
  }
  try {
    const client = new OrToolsSolverClient();
    const health = await client.health();
    if (!health?.ok) return null;
    return client.solve(body as never);
  } finally {
    if (prev === undefined) delete process.env.OR_TOOLS_SOLVER_URL;
    else process.env.OR_TOOLS_SOLVER_URL = prev;
  }
}

describe('ORTOOLS-ROAD-CLOSE-SHADOW harness', () => {
  const stops = [
    {
      nodeId: 'depot',
      serviceDurationMin: 0,
      isDepot: true as const,
      timeWindow: { startMin: 480, endMin: 480 },
      fixedStartMin: 480,
      isBooked: true,
    },
    { nodeId: 'a1', sourceActivityId: 'act-1', serviceDurationMin: 60, poiId: 'p1' },
    { nodeId: 'a2', sourceActivityId: 'act-2', serviceDurationMin: 60, poiId: 'p2' },
    { nodeId: 'a3', sourceActivityId: 'act-3', serviceDurationMin: 45, poiId: 'p3' },
    { nodeId: 'a4', sourceActivityId: 'act-4', serviceDurationMin: 60, poiId: 'p4' },
    { nodeId: 'a5', sourceActivityId: 'act-5', serviceDurationMin: 30, poiId: 'p5' },
  ];

  /** Base order uses a1→a2 on closed F208 */
  const ordered = stops.map((s) => s.nodeId);
  const matrix = [
    [0, 20, 35, 40, 25, 30],
    [20, 0, 15, 25, 30, 18],
    [35, 15, 0, 12, 22, 20],
    [40, 25, 12, 0, 18, 16],
    [25, 30, 22, 18, 0, 14],
    [30, 18, 20, 16, 14, 0],
  ];

  it('projects F208 closure and forbids a1→a2 hop', () => {
    const forbidden = inferForbiddenEdgesFromClosedRoad({
      roadId: 'F208',
      orderedNodeIds: ordered,
      closedHopIndices: [1], // a1 → a2
      canonicalConstraintId: 'road.close.F208',
    });
    const problem = projectRoadCloseToSolverProblem({
      requestId: 'harness-f208-1',
      tripId: 'trip-iceland-demo',
      planVersionId: 'pv-1',
      evidenceVersionId: 'ev-f208-closed',
      dayId: 'day-1',
      operation: 'SWAP',
      stops,
      travelMatrixMin: matrix,
      forbiddenEdges: forbidden,
      solverConfig: { maxCandidates: 3, timeLimitMs: 1500, seed: 42 },
    });

    expect(
      problem.constraints.some(
        (c) =>
          c.kind === 'EDGE_FORBIDDEN' &&
          c.payload.fromNodeId === 'a1' &&
          c.payload.toNodeId === 'a2',
      ),
    ).toBe(true);
  });

  it('shadow report never claims write authority', async () => {
    const forbidden = inferForbiddenEdgesFromClosedRoad({
      roadId: 'F208',
      orderedNodeIds: ordered,
      closedHopIndices: [1],
      canonicalConstraintId: 'road.close.F208',
    });
    const problem = projectRoadCloseToSolverProblem({
      requestId: 'harness-f208-2',
      tripId: 'trip-iceland-demo',
      planVersionId: 'pv-1',
      evidenceVersionId: 'ev-f208-closed',
      dayId: 'day-1',
      operation: 'SWAP',
      stops,
      travelMatrixMin: matrix,
      forbiddenEdges: forbidden,
    });

    const live = await solveLive(problem);
    const solverResponse =
      live ??
      ({
        schemaId: 'tripnara.solver_response@v1',
        requestId: problem.requestId,
        status: 'SOLVED',
        candidates: [
          {
            candidateId: 'offline:0',
            operation: 'SWAP',
            label: 'offline-bypass',
            dayPlans: [
              {
                dayId: 'day-1',
                // Avoid a1→a2
                nodeIds: ['depot', 'a1', 'a3', 'a2', 'a4', 'a5'],
                startMin: [480, 500, 580, 650, 730, 800],
              },
            ],
          },
        ],
        solverMeta: {
          engine: 'OR_TOOLS_ROUTING',
          version: 'offline',
          strategy: 'FIXTURE',
          nativeCpSat: false,
          seed: 42,
          elapsedMs: 1,
        },
      } satisfies SolverResponse);

    const violations = countForbiddenEdgeViolations(
      solverResponse.candidates,
      [{ fromNodeId: 'a1', toNodeId: 'a2' }],
    );
    expect(violations).toBe(0);

    const report = buildOrToolsRepairShadowReport({
      tripId: problem.tripId,
      requestId: problem.requestId,
      authorityProviderId: 'neptune-repair',
      authority: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'neptune-repair',
        tripId: problem.tripId,
        proposals: [{ proposalId: 'auth', candidateId: 'auth' }],
        generatedAt: new Date().toISOString(),
      },
      shadow: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'ortools-repair',
        tripId: problem.tripId,
        proposals: solverResponse.candidates.map((c) => ({
          proposalId: c.candidateId,
          candidateId: c.candidateId,
        })),
        generatedAt: new Date().toISOString(),
      },
      problem,
      solverResponse,
    });

    expect(report.writeAttempted).toBe(false);
    expect(report.gatewayRequired).toBe(true);
    expect(report.forbiddenEdgeViolations).toBe(0);
    expect(report.shadowNativeCpSat).toBe(false);
    expect(report.bookedNodeDropped).toBe(false);

    if (live) {
      expect(live.status).toBe('SOLVED');
      expect(live.candidates.length).toBeGreaterThan(0);
      expect(live.solverMeta.engine).toBe('OR_TOOLS_ROUTING');
    }
  });

  it('evidence version change forces shadow re-validation (stale attachment)', () => {
    const attachment = {
      evidenceVersionId: 'ev-f208-closed',
      snapshotId: 'snap-1',
    };
    expect(
      isOrtToolsShadowEvidenceStale({
        attachmentEvidenceVersionId: attachment.evidenceVersionId,
        attachmentSnapshotId: attachment.snapshotId,
        currentEvidenceVersionId: 'ev-f208-closed',
        currentSnapshotId: 'snap-1',
      }),
    ).toBe(false);
    expect(
      isOrtToolsShadowEvidenceStale({
        attachmentEvidenceVersionId: attachment.evidenceVersionId,
        attachmentSnapshotId: attachment.snapshotId,
        currentEvidenceVersionId: 'ev-f208-reopened',
        currentSnapshotId: 'snap-2',
      }),
    ).toBe(true);

    // Distinct evidence → distinct SolverProblem identity for re-solve
    const p1 = projectRoadCloseToSolverProblem({
      requestId: 'harness-ev-1',
      tripId: 'trip-iceland-demo',
      planVersionId: 'pv-1',
      evidenceVersionId: 'ev-f208-closed',
      dayId: 'day-1',
      operation: 'SWAP',
      stops,
      travelMatrixMin: matrix,
      forbiddenEdges: inferForbiddenEdgesFromClosedRoad({
        roadId: 'F208',
        orderedNodeIds: ordered,
        closedHopIndices: [1],
      }),
    });
    const p2 = projectRoadCloseToSolverProblem({
      requestId: 'harness-ev-2',
      tripId: 'trip-iceland-demo',
      planVersionId: 'pv-1',
      evidenceVersionId: 'ev-f208-reopened',
      dayId: 'day-1',
      operation: 'SWAP',
      stops,
      travelMatrixMin: matrix,
      forbiddenEdges: [],
    });
    expect(p1.evidenceVersionId).not.toBe(p2.evidenceVersionId);
    expect(p1.requestId).not.toBe(p2.requestId);
  });
});
