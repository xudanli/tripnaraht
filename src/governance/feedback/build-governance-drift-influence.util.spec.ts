import { buildGovernanceDriftInfluencesFromAssessment } from './build-governance-drift-influence.util';

describe('buildGovernanceDriftInfluencesFromAssessment', () => {
  it('maps recurring_block to search_constraints nudge', () => {
    const inf = buildGovernanceDriftInfluencesFromAssessment({
      signals: [
        {
          type: 'recurring_block',
          confidence: 0.9,
          evidenceEventIds: ['e1'],
          driftReasonCodes: ['gdres.x'],
        },
      ],
      recoveryQuality: { score: 0.9, recoveryCycleCount: 0, recurrenceCount: 0 },
    });
    expect(inf.some((i) => i.target === 'search_constraints')).toBe(true);
  });

  it('maps low RQI to planner_weights nudge', () => {
    const inf = buildGovernanceDriftInfluencesFromAssessment({
      signals: [],
      recoveryQuality: { score: 0.4, recoveryCycleCount: 2, recurrenceCount: 1 },
    });
    expect(inf.some((i) => i.target === 'planner_weights' && i.suggestedDelta < 0)).toBe(true);
  });
});
