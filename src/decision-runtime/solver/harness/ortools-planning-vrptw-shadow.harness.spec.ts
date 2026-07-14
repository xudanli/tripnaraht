/**
 * ADR-008 S4 harness — day VRPTW projection → shadow changes ≠ apply authority.
 */

import { buildSolverProblemFromDayItems } from '../projection/build-solver-problem-from-day-items.util';
import {
  pickBestSolverCandidate,
  solverCandidateToPlanProposalChanges,
} from '../adapters/ortools-to-plan-proposal-changes.adapter';
import {
  selectAuthoritativePlanProposalChanges,
  isOrtToolsPlanningShadowApplyLeak,
} from '../lab/ortools-planning-shadow-apply.guard';
import { buildOrToolsPlanningLabCompare } from '../lab/ortools-planning-lab-compare.util';
import type { PlanProposal } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import type { SolverResponse } from '../contracts/solver-response';

describe('ORTOOLS-PLANNING-VRPTW-SHADOW harness', () => {
  const items = [
    {
      itemId: 'act-1',
      label: 'Skógafoss',
      startTime: new Date('2026-07-20T09:00:00.000Z'),
      endTime: new Date('2026-07-20T10:30:00.000Z'),
      travelFromPreviousDurationMin: 20,
    },
    {
      itemId: 'act-2',
      label: 'Seljalandsfoss',
      startTime: new Date('2026-07-20T11:00:00.000Z'),
      endTime: new Date('2026-07-20T12:00:00.000Z'),
      travelFromPreviousDurationMin: 25,
    },
    {
      itemId: 'act-3',
      label: 'Reynisfjara',
      startTime: new Date('2026-07-20T13:30:00.000Z'),
      endTime: new Date('2026-07-20T15:00:00.000Z'),
      travelFromPreviousDurationMin: 40,
    },
  ];

  it('projects single-day SWAP problem without road-close constraints', () => {
    const problem = buildSolverProblemFromDayItems({
      requestId: 'harness-plan-1',
      tripId: 'trip-plan',
      planVersionId: '3',
      dayIndex: 1,
      items,
    });
    expect(problem).not.toBeNull();
    expect(problem!.operation).toBe('SWAP');
    expect(problem!.nodes).toHaveLength(4);
    expect(problem!.constraints.every((c) => c.kind !== 'EDGE_FORBIDDEN')).toBe(
      true,
    );
  });

  it('shadow changes stay off the apply path', () => {
    const offline: SolverResponse = {
      schemaId: 'tripnara.solver_response@v1',
      requestId: 'harness-plan-2',
      status: 'SOLVED',
      candidates: [
        {
          candidateId: 'offline:0',
          operation: 'SWAP',
          label: 'swap-offline',
          dayPlans: [
            {
              dayId: 'day-1',
              nodeIds: ['depot', 'act-3', 'act-1', 'act-2'],
              startMin: [480, 500, 620, 740],
            },
          ],
          objectiveValue: 90,
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
    };

    const best = pickBestSolverCandidate(offline.candidates)!;
    const shadowChanges = solverCandidateToPlanProposalChanges({
      candidate: best,
      dayIndex: 1,
      items,
    });
    expect(shadowChanges.length).toBeGreaterThan(0);
    expect(shadowChanges.every((c) => c.note?.includes('ortools-shadow'))).toBe(
      true,
    );

    const legacyChanges = [
      {
        operation: 'MOVE' as const,
        itemId: 'act-1',
        dayIndex: 1,
        startTime: '14:00',
        endTime: '15:30',
        label: 'legacy reverse',
      },
    ];

    const proposal = {
      proposalId: 'p-harness',
      tripId: 'trip-plan',
      userId: 'u',
      intent: 'OPTIMIZE_ROUTE',
      basePlanVersion: 3,
      contextVersion: 3,
      affectedDays: [1],
      changes: legacyChanges,
      tradeoffs: [],
      validation: { status: 'PASS', warnings: [], conflicts: [] },
      diff: { timelineChanges: [], summary: '' },
      requiresConfirmation: true,
      status: 'AWAITING_CONFIRMATION',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      source: { type: 'ai_action', payload: {} },
      ortoolsShadow: {
        schemaId: 'tripnara.ortools_planning_shadow@v1',
        shadowAuthority: false,
        planningIntent: 'OPTIMIZE_ROUTE',
        report: {
          schemaId: 'tripnara.ortools_repair_shadow@v1',
          tripId: 'trip-plan',
          requestId: offline.requestId,
          comparedAt: new Date().toISOString(),
          authorityProviderId: 'legacy-optimize-route',
          shadowProviderId: 'ortools-repair',
          authorityProposalCount: 1,
          shadowProposalCount: shadowChanges.length,
          shadowFoundCandidate: true,
          shadowNativeCpSat: false,
          forbiddenEdgeViolations: 0,
          bookedNodeDropped: false,
          undeclaredNodeDrops: false,
          writeAttempted: false,
          gatewayRequired: true,
          notes: [],
        },
        dayIndex: 1,
        legacyChangeCount: 1,
        shadowChangeCount: shadowChanges.length,
        shadowChanges,
        contextVersion: 3,
      },
    } as PlanProposal;

    const applied = selectAuthoritativePlanProposalChanges(proposal);
    expect(applied).toEqual(legacyChanges);
    expect(applied).not.toEqual(shadowChanges);
    expect(
      isOrtToolsPlanningShadowApplyLeak({
        proposal,
        appliedChanges: applied,
      }),
    ).toBe(false);
    expect(proposal.ortoolsShadow!.shadowAuthority).toBe(false);
    expect(proposal.ortoolsShadow!.report.writeAttempted).toBe(false);

    const problem = buildSolverProblemFromDayItems({
      requestId: 'harness-lab',
      tripId: 'trip-plan',
      planVersionId: '3',
      dayIndex: 1,
      items,
    });
    const lab = buildOrToolsPlanningLabCompare({
      tripId: 'trip-plan',
      dayIndex: 1,
      items,
      legacyChanges,
      shadowChanges,
      shadowNodeOrder: best.dayPlans[0]?.nodeIds,
      problem,
    });
    expect(lab.authoritativePromotion).toBe(false);
    expect(lab.shadowAuthority).toBe(false);
    expect(lab.itemsCompared).toBe(3);
  });
});
