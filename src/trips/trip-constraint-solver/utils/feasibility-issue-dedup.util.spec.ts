import {
  buildFeasibilityIssueDedupeKey,
  buildFeasibilityVerdictSubheadline,
  dedupeFeasibilityIssues,
} from './feasibility-issue-dedup.util';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';

describe('feasibility-issue-dedup', () => {
  it('merges travel timing duplicates from readiness + conflicts by anchor', () => {
    const finding: FeasibilityIssueDto = {
      id: 'issue-gap-1',
      priority: 'suggest_adjust',
      category: 'schedule',
      title: '交通衔接',
      message: 'readiness 口径描述',
      affectedDays: [2],
      severity: 'medium',
      issueKind: 'same_day_travel',
      fromItemId: 'item-a',
      toItemId: 'item-b',
    };
    const conflict: FeasibilityIssueDto = {
      id: 'issue-conflict-9',
      priority: 'must_handle',
      category: 'schedule',
      title: '冲突口径',
      message: 'conflicts 口径描述',
      affectedDays: [2],
      severity: 'high',
      issueKind: 'same_day_travel',
      fromItemId: 'item-a',
      toItemId: 'item-b',
      proofs: [{ entity: 'x', constraint: 'y', currentFact: 'z', evidenceSource: 'conflicts', evidenceType: 'timing', conclusion: 'block' }],
    };

    expect(buildFeasibilityIssueDedupeKey(finding)).toBe(buildFeasibilityIssueDedupeKey(conflict));

    const merged = dedupeFeasibilityIssues([finding, conflict]);
    expect(merged).toHaveLength(1);
    expect(merged[0].priority).toBe('must_handle');
    expect(merged[0].proofs).toHaveLength(1);
  });

  it('builds subheadline with must/suggest/pending buckets (not legacy 风险 lump)', () => {
    expect(
      buildFeasibilityVerdictSubheadline({
        mustHandle: 2,
        suggestAdjust: 1,
        pendingConfirm: 3,
        blockers: 2,
      }),
    ).toBe('2 项必处理、1 项建议调整、3 项待确认');
  });
});
