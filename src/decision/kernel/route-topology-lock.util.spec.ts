import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import {
  buildRouteTopologyLockRecord,
  extractSegmentIdsFromItinerary,
  segmentIdsEqual,
} from './route-topology-lock.util';

const anchor: Itinerary = {
  request_id: 't',
  days: [
    {
      date: '2026-07-01',
      items: [
        { id: 'a', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { name: 'A' } },
        { id: 'b', type: 'POI', start_window: '11:00', end_window: '12:00', location_ref: { name: 'B' } },
      ],
    },
  ],
  action_plan: [],
} as Itinerary;

describe('route-topology-lock.util', () => {
  it('segmentIdsEqual detects topology drift', () => {
    expect(segmentIdsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(segmentIdsEqual(['a', 'b'], ['a'])).toBe(false);
  });

  it('buildRouteTopologyLockRecord rejects divergent recommended plan', () => {
    const divergent: Itinerary = {
      request_id: 't',
      days: [
        {
          date: '2026-07-01',
          items: [{ id: 'z', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { name: 'Z' } }],
        },
      ],
      action_plan: [],
    } as Itinerary;

    const { lock, nextItinerary } = buildRouteTopologyLockRecord({
      anchorItinerary: anchor,
      tripId: 't',
      routeDirectionId: 'rd',
      recommendedItinerary: divergent,
    });

    expect(lock.recommendedPlanRejected).toBe(true);
    expect(extractSegmentIdsFromItinerary(nextItinerary, 't', 'rd')).toEqual(['a', 'b']);
  });
});
