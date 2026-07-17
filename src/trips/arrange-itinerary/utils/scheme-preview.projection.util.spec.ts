import {
  executableChangeId,
  filterChangesByEnabledItemIds,
  projectSchemePreview,
} from './scheme-preview.projection.util';
import type { PlanProposal } from '../types/plan-proposal.types';

function baseProposal(overrides: Partial<PlanProposal> = {}): PlanProposal {
  return {
    proposalId: 'proposal_1',
    tripId: 'trip_1',
    userId: 'u1',
    intent: 'AUTO_ARRANGE',
    basePlanVersion: 1,
    contextVersion: 10,
    affectedDays: [1, 2],
    changes: [
      {
        operation: 'ADD',
        candidateId: 'c1',
        dayIndex: 1,
        startTime: '09:00',
        endTime: '11:00',
        label: '黄金瀑布',
        removeFromCandidates: true,
      },
      {
        operation: 'REMOVE_CANDIDATE',
        candidateId: 'c1',
        dayIndex: 1,
        label: '黄金瀑布',
      },
      {
        operation: 'ADD',
        candidateId: 'c2',
        dayIndex: 2,
        startTime: '10:00',
        endTime: '12:00',
        label: '间歇泉',
        removeFromCandidates: true,
      },
      {
        operation: 'REMOVE_CANDIDATE',
        candidateId: 'c2',
        dayIndex: 2,
        label: '间歇泉',
      },
    ],
    benefits: { itemsAdded: 2, drivingTimeReducedMinutes: 36 },
    tradeoffs: ['均匀分配到各天'],
    validation: { status: 'PASS', warnings: [], conflicts: [] },
    diff: {
      summary: '新增 2 个景点',
      timelineChanges: [
        {
          operation: 'ADD',
          label: '黄金瀑布',
          dayIndex: 1,
          to: '09:00',
          impact: 'medium',
        },
      ],
    },
    requiresConfirmation: true,
    status: 'AWAITING_CONFIRMATION',
    answer: '已生成自动编排草案',
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    source: { type: 'auto_arrange', payload: {} },
    ...overrides,
  };
}

describe('scheme-preview.projection.util', () => {
  it('projects analysis steps, suggestions, and timeline for auto-arrange', () => {
    const preview = projectSchemePreview(baseProposal());
    expect(preview.analysisSteps).toHaveLength(3);
    expect(preview.suggestions[0]).toContain('自动编排');
    expect(preview.comparison.optimizedDriving).toContain('约减');
    expect(preview.executableItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cand-c1', defaultEnabled: true }),
        expect.objectContaining({ id: 'cand-c2' }),
      ]),
    );
    expect(preview.timelinePreview[0]).toMatchObject({
      dayIndex: 1,
      time: '09:00',
      title: '黄金瀑布',
      status: 'insertSlot',
    });
  });

  it('filters changes by enabledItemIds and keeps matching REMOVE_CANDIDATE', () => {
    const proposal = baseProposal();
    const filtered = filterChangesByEnabledItemIds(proposal.changes, [
      executableChangeId(proposal.changes[0]!, 0),
    ]);
    expect(filtered.map((c) => c.operation)).toEqual(['ADD', 'REMOVE_CANDIDATE']);
    expect(filtered.every((c) => c.candidateId === 'c1')).toBe(true);
  });
});
