import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import { findFeasibilityIssueForCanonicalRow } from './canonical-fallback-options.util';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';

describe('canonical-fallback-options.util', () => {
  const row = {
    semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
    scope: {
      tripId: 'trip-1',
      itemIds: ['item-a'],
      routeSegmentIds: ['road:F208'],
      dayIds: [2],
    },
  } as InternalUnifiedProblemRow;

  it('matches feasibility issue by semanticKey and scope', () => {
    const collected = {
      feasibilityIssues: [
        {
          id: 'road-1',
          semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
          fromItemId: 'item-a',
          priority: 'must_handle',
          category: 'transport',
          title: '道路封闭',
          message: 'F208 封闭',
          severity: 'high',
        } as FeasibilityIssueDto,
        {
          id: 'other',
          semanticKey: 'plan_object_meal_gap_day_1',
          priority: 'suggest_adjust',
          category: 'schedule',
          title: '午餐',
          message: 'gap',
          severity: 'low',
        } as FeasibilityIssueDto,
      ],
    } as never;

    const issue = findFeasibilityIssueForCanonicalRow(collected, row);
    expect(issue?.id).toBe('road-1');
  });
});
