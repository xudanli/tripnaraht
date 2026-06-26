import { buildReputationFactsSummary } from './constants/reputation-event.constants';
import { COMMON_QUALIFICATION_TYPES } from './constants/qualification.constants';
import { ENDORSEMENT_TYPES } from './constants/endorsement.constants';

describe('reputation-event.constants', () => {
  it('builds explainable fact counts without composite score', () => {
    const occurredAt = new Date('2026-06-01T00:00:00.000Z');
    const summary = buildReputationFactsSummary([
      { eventType: 'PROJECT_COMPLETED', occurredAt },
      { eventType: 'PROJECT_COMPLETED', occurredAt: new Date('2026-05-01T00:00:00.000Z') },
      { eventType: 'COMPLAINT_CONFIRMED', occurredAt },
    ]);

    expect(summary.projectsCompleted).toBe(2);
    expect(summary.complaintsConfirmed).toBe(1);
    expect(summary.lastProjectCompletedAt).toBe(occurredAt.toISOString());
    expect(summary).not.toHaveProperty('compositeScore');
    expect(summary).not.toHaveProperty('creditScore');
  });
});

describe('qualification.constants', () => {
  it('exports common qualification types', () => {
    expect(COMMON_QUALIFICATION_TYPES).toContain('FIRST_AID');
    expect(COMMON_QUALIFICATION_TYPES).toContain('OUTDOOR_GUIDE');
  });
});

describe('endorsement.constants', () => {
  it('exports fact-based endorsement types', () => {
    expect(ENDORSEMENT_TYPES).toContain('PROJECT_LEADERSHIP');
    expect(ENDORSEMENT_TYPES).toContain('SAFETY_PRACTICES');
  });
});
