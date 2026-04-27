import { buildToleranceResolver, metricForRuleId } from './decision-contract-compare.util';

describe('decision-contract-compare.util', () => {
  it('maps rule_id to deterministic metrics', () => {
    expect(metricForRuleId({ rule_id: 'fatigue.max_daily', unit: '' })).toBe('fatigue_index');
    expect(metricForRuleId({ rule_id: 'fatigue.overloaded_days', unit: '' })).toBe('fatigue_overloaded_days');
  });

  it('falls back to unit heuristic when rule_id unknown', () => {
    expect(metricForRuleId({ rule_id: 'x', unit: 'm/s' })).toBe('wind_speed_mps');
    expect(metricForRuleId({ rule_id: 'x', unit: 'm' })).toBe('visibility_meters');
    expect(metricForRuleId({ rule_id: 'x', unit: 'min' })).toBe('sunset_offset_min');
  });

  it('resolves tolerances from allowed_variance list', () => {
    const { tolForMetric } = buildToleranceResolver([
      { metric: 'fatigue_index', op: 'abs_delta_lte', threshold: 0.2 },
      { metric: 'wind_speed_mps', op: 'abs_delta_lte', threshold: 2 },
    ]);
    expect(tolForMetric('fatigue_index')).toBe(0.2);
    expect(tolForMetric('wind_speed_mps')).toBe(2);
    // default fallback when not provided
    expect(tolForMetric('sunset_offset_min')).toBe(10);
  });
});

