import { mapItineraryVerifyIssueToVerificationIssue } from './map-itinerary-verify-issue.util';
import { CONSTRAINT_IDS } from '../services/constraint-registry';

describe('mapItineraryVerifyIssueToVerificationIssue', () => {
  it('POI_ACCESS_BLOCKED 预约 → TIME_WINDOW_BREACH + suggestedActions', () => {
    const issue = mapItineraryVerifyIssueToVerificationIssue({
      type: 'POI_ACCESS_BLOCKED',
      severity: 'ERROR',
      item_id: 'item-1',
      message: 'Blue Lagoon：入场需要预约',
      suggestion: '前往官方预订',
      violation: {
        anchor: { constraintId: CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION },
        entityRef: { type: 'POI', id: 'item-1' },
        suggestedActions: [{ action: 'ASK_USER', detail: '预订' }],
      },
    });

    expect(issue?.code).toBe('TIME_WINDOW_BREACH');
    expect(issue?.class).toBe('CONFLICT');
    expect(issue?.suggestedActions?.length).toBe(1);
    expect(issue?.metadata?.poi_access_constraint_id).toBe(
      CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION,
    );
  });

  it('POI_ACCESS_RISK → ADVISORY', () => {
    const issue = mapItineraryVerifyIssueToVerificationIssue({
      type: 'POI_ACCESS_RISK',
      severity: 'WARNING',
      message: 'Gullfoss：预计等待较长',
    });
    expect(issue?.class).toBe('ADVISORY');
  });
});
