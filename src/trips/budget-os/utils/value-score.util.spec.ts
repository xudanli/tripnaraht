import {
  buildTripValueSummary,
  computeItemValueScore,
  satisfactionToUnit,
} from './value-score.util';
import type { ValueFeedbackRow } from '../types/value-feedback.types';

describe('value-score.util', () => {
  it('maps satisfaction 1-5 to 0.2-1.0', () => {
    expect(satisfactionToUnit(5)).toBe(1);
    expect(satisfactionToUnit(1)).toBe(0.2);
  });

  it('computes higher value score when satisfaction high vs amount low', () => {
    const high = computeItemValueScore(5, 300, 'experience');
    const low = computeItemValueScore(2, 3000, 'experience');
    expect(high).toBeGreaterThan(low);
  });

  it('builds trip value summary with activities alias', () => {
    const feedbacks: ValueFeedbackRow[] = [
      {
        tripId: 't1',
        sourceType: 'itinerary_item',
        sourceId: 'i1',
        amount: 3000,
        category: 'experience',
        satisfaction: 5,
        createdBy: 'u1',
      },
      {
        tripId: 't1',
        sourceType: 'itinerary_item',
        sourceId: 'i2',
        amount: 3000,
        category: 'accommodation',
        satisfaction: 2,
        createdBy: 'u1',
      },
    ];

    const summary = buildTripValueSummary(feedbacks);
    expect(summary.byCategory.experience.feedbackCount).toBe(1);
    expect(summary.byCategory.experience.valueScore).toBeGreaterThan(
      summary.byCategory.accommodation.valueScore,
    );
    expect(summary.byCategory.activities).toEqual(summary.byCategory.experience);
    expect(summary.overallValueScore).toBeGreaterThan(0);
  });
});
