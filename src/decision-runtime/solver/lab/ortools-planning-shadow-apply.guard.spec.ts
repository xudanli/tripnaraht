import {
  isOrtToolsPlanningShadowApplyLeak,
  selectAuthoritativePlanProposalChanges,
} from './ortools-planning-shadow-apply.guard';
import type { PlanProposal } from '../../../trips/arrange-itinerary/types/plan-proposal.types';

function baseProposal(
  overrides: Partial<PlanProposal> = {},
): PlanProposal {
  return {
    proposalId: 'p1',
    tripId: 't1',
    userId: 'u1',
    intent: 'OPTIMIZE_ROUTE',
    basePlanVersion: 1,
    contextVersion: 1,
    affectedDays: [1],
    changes: [
      {
        operation: 'MOVE',
        itemId: 'a1',
        dayIndex: 1,
        startTime: '10:00',
        endTime: '11:00',
      },
    ],
    tradeoffs: [],
    validation: { status: 'PASS', warnings: [], conflicts: [] },
    diff: { timelineChanges: [], summary: '' },
    requiresConfirmation: true,
    status: 'AWAITING_CONFIRMATION',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    source: { type: 'ai_action', payload: {} },
    ...overrides,
  };
}

describe('ortools-planning-shadow-apply.guard', () => {
  it('selects only proposal.changes', () => {
    const proposal = baseProposal({
      ortoolsShadow: {
        schemaId: 'tripnara.ortools_planning_shadow@v1',
        shadowAuthority: false,
        planningIntent: 'OPTIMIZE_ROUTE',
        report: {
          schemaId: 'tripnara.ortools_repair_shadow@v1',
          tripId: 't1',
          requestId: 'r',
          comparedAt: '',
          authorityProviderId: 'legacy-optimize-route',
          shadowProviderId: 'ortools-repair',
          authorityProposalCount: 1,
          shadowProposalCount: 1,
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
        shadowChangeCount: 1,
        shadowChanges: [
          {
            operation: 'MOVE',
            itemId: 'a2',
            dayIndex: 1,
            note: '[ortools-shadow] SWAP x',
          },
        ],
        contextVersion: 1,
      },
    });
    const auth = selectAuthoritativePlanProposalChanges(proposal);
    expect(auth).toHaveLength(1);
    expect(auth[0]!.itemId).toBe('a1');
  });

  it('detects shadow-only apply leak', () => {
    const proposal = baseProposal({
      changes: [{ operation: 'MOVE', itemId: 'a1', dayIndex: 1 }],
      ortoolsShadow: {
        schemaId: 'tripnara.ortools_planning_shadow@v1',
        shadowAuthority: false,
        planningIntent: 'OPTIMIZE_ROUTE',
        report: {
          schemaId: 'tripnara.ortools_repair_shadow@v1',
          tripId: 't1',
          requestId: 'r',
          comparedAt: '',
          authorityProviderId: 'legacy-optimize-route',
          shadowProviderId: 'ortools-repair',
          authorityProposalCount: 1,
          shadowProposalCount: 1,
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
        shadowChangeCount: 1,
        shadowChanges: [
          {
            operation: 'MOVE',
            itemId: 'a2',
            dayIndex: 1,
            note: '[ortools-shadow] SWAP x',
          },
        ],
        contextVersion: 1,
      },
    });
    expect(
      isOrtToolsPlanningShadowApplyLeak({
        proposal,
        appliedChanges: [
          {
            operation: 'MOVE',
            itemId: 'a2',
            dayIndex: 1,
            note: '[ortools-shadow] SWAP x',
          },
        ],
      }),
    ).toBe(true);
    expect(
      isOrtToolsPlanningShadowApplyLeak({
        proposal,
        appliedChanges: selectAuthoritativePlanProposalChanges(proposal),
      }),
    ).toBe(false);
  });
});
