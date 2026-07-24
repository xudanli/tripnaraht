import { feasibilityIssueToReadinessFinding, scoreFindingToTreeItem } from './poi-access-readiness-findings.util';
import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';

describe('poi-access-readiness-findings.util', () => {
  it('maps poi_access issue with visitorAccess', () => {
    const issue: FeasibilityIssueDto = {
      id: 'poi-access:item-1:poi_access_reservation_required',
      priority: 'must_handle',
      category: 'access_capacity',
      issueKind: 'poi_access_reservation_required',
      title: 'Landmannalaugar：需要预约',
      message: '需要预约',
      affectedDays: [1],
      severity: 'high',
      fromItemId: 'item-1',
      visitorAccess: {
        evaluation: {
          verdict: 'RESERVATION_REQUIRED',
          poiId: 'is.landmannalaugar',
          message: '需要预约',
          confidence: 'OFFICIAL',
          planBHints: [],
        },
        hasReservationEvidence: false,
      },
    };

    const finding = feasibilityIssueToReadinessFinding(issue);
    expect(finding.category).toBe('access_capacity');
    expect(finding.type).toBe('must');
    expect(finding.visitorAccess?.evaluation.poiId).toBe('is.landmannalaugar');
  });

  it('maps score finding to tree item with visitorAccess', () => {
    const finding = feasibilityIssueToReadinessFinding({
      id: 'poi-access:item-1:poi_access_blocked',
      priority: 'must_handle',
      category: 'access_capacity',
      issueKind: 'poi_access_blocked',
      title: 'Blue Lagoon 已满',
      message: 'Blue Lagoon：已满',
      affectedDays: [2],
      severity: 'high',
      fromItemId: 'item-bl',
      visitorAccess: {
        evaluation: {
          verdict: 'BLOCKED',
          poiId: 'is.blue_lagoon',
          message: '已满',
          confidence: 'PARTNER',
          planBHints: [],
        },
        hasReservationEvidence: false,
      },
    });

    const item = scoreFindingToTreeItem(finding);
    expect(item.level).toBe('blocker');
    expect(item.id).toBe('poi-access:item-1:poi_access_blocked');
    expect(item.visitorAccess?.evaluation.poiId).toBe('is.blue_lagoon');
    expect(item.tripScope?.day).toBe(2);
  });
});
