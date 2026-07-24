import { buildUnifiedDecisionProblemListView } from './unified-decision-problem-projection.util';
import {
  buildPlanningConflictsSummaryFromItems,
  projectListItemsToPlanningConflicts,
} from './planning-conflicts-projection.util';

describe('planning-conflicts SSOT alignment', () => {
  it('conflicts.summary.total equals problems.meta.openCount', () => {
    const view = buildUnifiedDecisionProblemListView({
      tripId: 'trip1',
      queueOnly: true,
      rows: [
        {
          problemId: 'p1',
          authority: 'LEGACY',
          semanticKey: 'INSUFFICIENT_TRANSFER_BUFFER',
          instanceKey: 'inst:1',
          type: 'CONFLICT',
          dimension: 'SCHEDULE',
          enforcement: 'REQUIRE_ADJUSTMENT',
          phase: 'PLANNING',
          affectsPlan: true,
          workflowStatus: 'OPEN',
          executionStatus: 'NOT_STARTED',
          title: '交通缓冲不足',
          summary: 'Day 1 buffer tight',
          scope: { tripId: 'trip1', dayIds: [1] },
          evidenceCount: 1,
          evidenceFreshness: 'FRESH',
          occurrenceCount: 1,
          occurrences: [],
          hasExecutableOptions: true,
          sourceIds: [],
          detectors: [],
          origin: { authority: 'LEGACY', engineId: 'LEGACY_V15' },
        } as never,
        {
          problemId: 'p2',
          authority: 'LEGACY',
          semanticKey: 'READINESS_SAFETY_EMERGENCY',
          instanceKey: 'inst:emergency',
          type: 'INFORM',
          dimension: 'OTHER',
          enforcement: 'REQUIRE_CONFIRMATION',
          phase: 'PLANNING',
          affectsPlan: true,
          workflowStatus: 'OPEN',
          executionStatus: 'NOT_STARTED',
          title: '冰岛紧急电话',
          summary: '112',
          scope: { tripId: 'trip1' },
          evidenceCount: 1,
          evidenceFreshness: 'FRESH',
          occurrenceCount: 1,
          occurrences: [],
          sourceIds: [],
          detectors: [],
          origin: { authority: 'LEGACY', engineId: 'LEGACY_V15' },
        } as never,
        {
          problemId: 'p3',
          authority: 'LEGACY',
          semanticKey: 'LOW_PRIORITY_WARN',
          instanceKey: 'inst:warn',
          type: 'WARNING',
          dimension: 'SCHEDULE',
          enforcement: 'WARN',
          phase: 'PLANNING',
          affectsPlan: true,
          workflowStatus: 'OPEN',
          executionStatus: 'NOT_STARTED',
          title: '轻微节奏提醒',
          summary: 'no actions',
          scope: { tripId: 'trip1', dayIds: [2] },
          evidenceCount: 1,
          evidenceFreshness: 'FRESH',
          occurrenceCount: 1,
          occurrences: [],
          hasExecutableOptions: false,
          sourceIds: [],
          detectors: [],
          origin: { authority: 'LEGACY', engineId: 'LEGACY_V15' },
        } as never,
      ],
    });

    const conflicts = projectListItemsToPlanningConflicts(view.items);
    const summary = buildPlanningConflictsSummaryFromItems(conflicts);

    expect(view.meta.openCount).toBe(1);
    expect(summary.total).toBe(view.meta.openCount);
    expect(conflicts.map((c) => c.id)).toEqual(['p1']);
  });
});
