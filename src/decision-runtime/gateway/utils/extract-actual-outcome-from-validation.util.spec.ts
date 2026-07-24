import {
  extractActualOutcomeFromDecisionValidation,
  provisionalActualOutcomeFromApply,
} from './extract-actual-outcome-from-validation.util';
import type { DecisionOutcomeValidation } from '../../../trips/decision-semantics/types/decision-semantics.types';

describe('extractActualOutcomeFromDecisionValidation', () => {
  it('returns undefined when no observations', () => {
    expect(extractActualOutcomeFromDecisionValidation(undefined)).toBeUndefined();
    expect(
      extractActualOutcomeFromDecisionValidation({
        id: 'v1',
        decisionId: 'd1',
        tripId: 't1',
        expectedOutcomes: [],
        observedOutcomes: [],
        verdict: 'PENDING',
      }),
    ).toBeUndefined();
  });

  it('maps verdict-only CONFIRMED without metric samples', () => {
    const actual = extractActualOutcomeFromDecisionValidation({
      id: 'v1',
      decisionId: 'd1',
      tripId: 't1',
      expectedOutcomes: [],
      observedOutcomes: [],
      verdict: 'CONFIRMED',
      evaluatedAt: '2026-07-17T16:01:00.000Z',
    });
    expect(actual?.completed).toBe(true);
    expect(actual?.metrics?.iceland_miss_prob).toBeCloseTo(0.05);
  });

  it('maps ACTIVITY_COMPLETION + DRIVING_DURATION into ActualOutcomeSnapshot', () => {
    const validation: DecisionOutcomeValidation = {
      id: 'v1',
      decisionId: 'd1',
      tripId: 't1',
      expectedOutcomes: [],
      observedOutcomes: [
        {
          metric: 'ACTIVITY_COMPLETION',
          actualValue: true,
          observedAt: '2026-07-17T16:00:00.000Z',
          source: 'BOOKING_CHECKIN',
          confidence: 0.9,
        },
        {
          metric: 'DRIVING_DURATION',
          actualValue: 155,
          observedAt: '2026-07-17T16:00:00.000Z',
          source: 'NAVIGATION_EVENT',
          confidence: 0.8,
        },
      ],
      verdict: 'CONFIRMED',
      evaluatedAt: '2026-07-17T16:01:00.000Z',
    };

    const actual = extractActualOutcomeFromDecisionValidation(validation);
    expect(actual?.completed).toBe(true);
    expect(actual?.metrics?.actual_travel_minutes).toBe(155);
    expect(actual?.metrics?.iceland_miss_prob).toBeCloseTo(0.05);
    expect(actual?.sources).toEqual(
      expect.arrayContaining(['BOOKING_CHECKIN', 'NAVIGATION_EVENT']),
    );
  });

  it('maps REFUTED completion failure', () => {
    const actual = extractActualOutcomeFromDecisionValidation({
      id: 'v1',
      decisionId: 'd1',
      tripId: 't1',
      expectedOutcomes: [],
      observedOutcomes: [
        {
          metric: 'ACTIVITY_COMPLETION',
          actualValue: false,
          observedAt: '2026-07-17T16:00:00.000Z',
          source: 'BOOKING_STATUS',
          confidence: 0.85,
        },
      ],
      verdict: 'REFUTED',
    });
    expect(actual?.completed).toBe(false);
    expect(actual?.metrics?.iceland_miss_prob).toBeCloseTo(0.9);
  });

  it('provisional apply signal has no completion metrics', () => {
    const provisional = provisionalActualOutcomeFromApply({ applied: true });
    expect(provisional?.completed).toBeUndefined();
    expect(provisional?.sources).toContain('SYSTEM_INFERENCE');
  });
});
