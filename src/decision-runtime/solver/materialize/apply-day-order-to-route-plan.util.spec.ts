import {
  applyDayOrderToRoutePlan,
  applySolverCandidateToRoutePlan,
  segmentNodeKey,
} from './apply-day-order-to-route-plan.util';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';

describe('applyDayOrderToRoutePlan', () => {
  const base: RoutePlanDraft = {
    tripId: 't1',
    routeDirectionId: 'rd1',
    segments: [
      {
        segmentId: 's1',
        dayIndex: 0,
        distanceKm: 10,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a1', poiId: 'p1', serviceDurationMin: 60 },
      },
      {
        segmentId: 's2',
        dayIndex: 0,
        distanceKm: 12,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a2', poiId: 'p2' },
      },
      {
        segmentId: 's3',
        dayIndex: 0,
        distanceKm: 8,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: 'a3', poiId: 'p3' },
      },
    ],
  };

  it('reorders day segments by solver node ids', () => {
    const next = applyDayOrderToRoutePlan(base, {
      dayIndex: 0,
      orderedNodeIds: ['depot', 'a3', 'a1', 'a2'],
    });
    expect(next.segments.map(segmentNodeKey)).toEqual(['a3', 'a1', 'a2']);
  });

  it('REPLACE drops missing nodes and inserts alt substitutes', () => {
    const next = applySolverCandidateToRoutePlan(
      base,
      {
        candidateId: 'c1',
        operation: 'REPLACE',
        label: 'replace-a2',
        dayPlans: [
          {
            dayId: 'day-0',
            nodeIds: ['depot', 'a1', 'alt:a2', 'a3'],
          },
        ],
        diffHint: {
          removedActivityIds: ['a2'],
          addedPoiIds: ['p2-alt'],
        },
      },
      0,
    );
    const keys = next.segments.map(segmentNodeKey);
    expect(keys).toEqual(['a1', 'alt:a2', 'a3']);
    expect(keys).not.toContain('a2');
  });

  it('SHORTEN stamps reduced serviceDurationMin', () => {
    const next = applySolverCandidateToRoutePlan(
      base,
      {
        candidateId: 'c2',
        operation: 'SHORTEN',
        label: 'shorten-a1',
        dayPlans: [
          { dayId: 'day-0', nodeIds: ['depot', 'a1', 'a2', 'a3'] },
        ],
        diffHint: { shiftedActivityIds: ['a1'] },
      },
      0,
    );
    const a1 = next.segments.find((s) => segmentNodeKey(s) === 'a1');
    expect((a1?.metadata as { serviceDurationMin?: number }).serviceDurationMin).toBe(
      45,
    );
  });
});
