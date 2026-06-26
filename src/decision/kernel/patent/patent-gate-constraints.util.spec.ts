import type { DecisionState } from '../decision-state.types';
import { enrichPatentGateConstraintExtensions } from './patent-gate-constraints.util';

describe('enrichPatentGateConstraintExtensions', () => {
  it('adds weather warning when weatherRisk exceeds threshold', () => {
    const prev = process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS;
    process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS = '1';
    try {
      const dso = {
        userIntent: {
          constraints: {
            _patentIntakeSeeds: {
              userAge: 65,
              daily_walk: { max_per_day: 5, unit: 'km', reason: '用户年龄65岁' },
            },
          },
        },
        environmentState: { weatherRisk: 0.9 },
      } as DecisionState;
      const out = enrichPatentGateConstraintExtensions(dso, { feasible: true, violations: [] });
      expect(out.daily_walk?.max_per_day).toBe(5);
      expect(out.weather_risk?.current).toBe(0.9);
      expect(out.warnings?.[0]?.type).toBe('weather');
    } finally {
      if (prev === undefined) delete process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS;
      else process.env.DECISION_OS_PATENT_GATE_CONSTRAINTS = prev;
    }
  });
});
