import { evaluateUserConstraintFacts } from './user-constraint-evaluator.util';
import type { ConstraintFact } from '../contracts/constraint-fact';

describe('evaluateUserConstraintFacts', () => {
  it('blocks when plan cost exceeds HARD budget LTE', () => {
    const facts: ConstraintFact[] = [
      {
        factId: 'user_c_budget',
        type: 'BUDGET',
        subject: { type: 'TRIP', id: 'trip_1' },
        value: { type: 'HARD', operator: 'LTE', value: 1000, label: '总预算' },
        source: {
          provider: 'trip-constraints-api',
          sourceType: 'USER',
          retrievedAt: new Date().toISOString(),
        },
        confidence: 0.9,
        freshnessStatus: 'FRESH',
      },
    ];

    const assertions = evaluateUserConstraintFacts({
      tripId: 'trip_1',
      facts,
      plan: {
        version: 't',
        createdAt: new Date().toISOString(),
        days: [],
        metrics: { estTotalCost: 1500 },
      },
    });

    expect(assertions.some((a) => a.status === 'BLOCK' && a.reasonCode === 'USER_BUDGET_OVERRUN')).toBe(
      true,
    );
  });
});
