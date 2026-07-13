import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import {
  applyPrerequisiteUserState,
  extractPrerequisiteFromIssue,
  extractPrerequisitesFromIssues,
  summarizePrerequisites,
} from './prerequisite-extract.util';
import {
  buildExperienceRegretFeasibilityIssueId,
  buildExperienceRegretPrerequisiteId,
  buildPoiAccessFeasibilityIssueId,
  buildPoiAccessPrerequisiteId,
} from './prerequisite-id.util';

describe('prerequisite-extract.util', () => {
  const tripId = 'trip-1';

  it('extracts poi access reservation prerequisite with stable ids', () => {
    const issue: FeasibilityIssueDto = {
      id: buildPoiAccessFeasibilityIssueId('item-1', 'poi_access_reservation_required'),
      prerequisiteId: buildPoiAccessPrerequisiteId('item-1', 'poi_access_reservation_required'),
      priority: 'must_handle',
      category: 'access_capacity',
      issueKind: 'poi_access_reservation_required',
      title: 'Landmannalaugar：需要预约',
      message: '需提前预约',
      affectedDays: [4],
      severity: 'high',
      fromItemId: 'item-1',
      visitorAccess: {
        evaluation: {
          verdict: 'RESERVATION_REQUIRED',
          poiId: 'landmannalaugar',
          message: '需预约',
          confidence: 'HIGH',
          planBHints: [],
        },
        hasReservationEvidence: false,
      },
    };

    const prereq = extractPrerequisiteFromIssue(issue, tripId);
    expect(prereq?.id).toBe('prereq:poi-access:item-1:poi_access_reservation_required');
    expect(prereq?.projections.feasibility?.issueId).toBe(
      'poi-access:item-1:poi_access_reservation_required',
    );
    expect(prereq?.projections.departurePrep.findingItemId).toBe(prereq?.id);
    expect(prereq?.relatedActivity?.dayNumber).toBe(4);
  });

  it('marks reservation prerequisite CONFIRMED when evidence exists', () => {
    const issue: FeasibilityIssueDto = {
      id: buildPoiAccessFeasibilityIssueId('item-1', 'poi_access_reservation_required'),
      prerequisiteId: buildPoiAccessPrerequisiteId('item-1', 'poi_access_reservation_required'),
      priority: 'must_handle',
      category: 'access_capacity',
      issueKind: 'poi_access_reservation_required',
      title: 'X：需要预约',
      message: '需预约',
      affectedDays: [1],
      severity: 'high',
      visitorAccess: {
        evaluation: {
          verdict: 'RESERVATION_REQUIRED',
          poiId: 'x',
          message: 'm',
          confidence: 'HIGH',
          planBHints: [],
        },
        hasReservationEvidence: true,
      },
    };

    const [resolved] = applyPrerequisiteUserState(extractPrerequisitesFromIssues(tripId, [issue]), {
      checkedIds: new Set(),
      notApplicableIds: new Set(),
    });
    expect(resolved.status).toBe('CONFIRMED');
  });

  it('extracts experience regret prerequisite', () => {
    const issue: FeasibilityIssueDto = {
      id: buildExperienceRegretFeasibilityIssueId(tripId),
      prerequisiteId: buildExperienceRegretPrerequisiteId(tripId),
      priority: 'must_handle',
      category: 'experience_expectation',
      issueKind: 'experience_regret_unconfirmed',
      title: '请确认体验底线',
      message: '出发前请确认',
      affectedDays: [],
      severity: 'high',
    };

    const prereq = extractPrerequisiteFromIssue(issue, tripId);
    expect(prereq?.kind).toBe('experience_regret_confirmation');
    expect(prereq?.projections.departurePrep.level).toBe('must');
  });

  it('summarizes prerequisite counts', () => {
    const summary = summarizePrerequisites([
      { status: 'UNCONFIRMED' } as never,
      { status: 'CONFIRMED' } as never,
      { status: 'NOT_APPLICABLE' } as never,
    ]);
    expect(summary).toEqual({ total: 3, open: 1, confirmed: 1, notApplicable: 1 });
  });
});
