import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { TripPrerequisite } from '../types/trip-prerequisite.types';
import {
  enrichFeasibilityIssuesWithPrerequisiteIds,
  projectOpenPrerequisitesToDeparturePrepItems,
  projectPrerequisiteToDeparturePrepItem,
} from './prerequisite-projection.util';
import {
  buildPoiAccessFeasibilityIssueId,
  buildPoiAccessPrerequisiteId,
} from './prerequisite-id.util';

describe('prerequisite-projection.util', () => {
  const tripId = 'trip-1';
  const prerequisiteId = buildPoiAccessPrerequisiteId('item-1', 'poi_access_reservation_required');
  const issueId = buildPoiAccessFeasibilityIssueId('item-1', 'poi_access_reservation_required');

  const basePrerequisite: TripPrerequisite = {
    id: prerequisiteId,
    tripId,
    kind: 'poi_access_reservation',
    title: '确认预约：Landmannalaugar',
    description: '需提前预约',
    status: 'UNCONFIRMED',
    relatedActivity: {
      tripItemId: 'item-1',
      poiId: 'landmannalaugar',
      poiName: 'Landmannalaugar',
      dayNumber: 4,
    },
    source: { system: 'poi_access', feasibilityIssueId: issueId },
    projections: {
      departurePrep: {
        findingItemId: prerequisiteId,
        level: 'must',
        category: 'activities_bookings',
      },
      feasibility: { issueId, issueKind: 'poi_access_reservation_required' },
    },
    updatedAt: new Date().toISOString(),
  };

  it('projects open prerequisite to departure prep item with prerequisiteId', () => {
    const item = projectPrerequisiteToDeparturePrepItem(basePrerequisite);
    expect(item.id).toBe(prerequisiteId);
    expect(item.prerequisiteId).toBe(prerequisiteId);
    expect(item.level).toBe('must');
    expect(item.tripScope?.day).toBe(4);
  });

  it('filters confirmed prerequisites from departure prep projection', () => {
    const items = projectOpenPrerequisitesToDeparturePrepItems([
      basePrerequisite,
      { ...basePrerequisite, id: 'other', status: 'CONFIRMED' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(prerequisiteId);
  });

  it('enriches feasibility issues with prerequisiteId', () => {
    const issue: FeasibilityIssueDto = {
      id: issueId,
      priority: 'must_handle',
      category: 'access_capacity',
      issueKind: 'poi_access_reservation_required',
      title: 'Landmannalaugar：需要预约',
      message: '需预约',
      affectedDays: [4],
      severity: 'high',
      fromItemId: 'item-1',
    };

    const enriched = enrichFeasibilityIssuesWithPrerequisiteIds(tripId, [issue], [basePrerequisite]);
    expect(enriched[0].prerequisiteId).toBe(prerequisiteId);
  });
});
