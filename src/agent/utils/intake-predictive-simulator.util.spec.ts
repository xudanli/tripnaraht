import { buildHistoricalBoundarySimulations, estimateUtilityDeltaForSimulatedTrace } from './intake-predictive-simulator.util';

describe('intake-predictive-simulator.util — estimated_utility_delta', () => {
  it('estimateUtilityDeltaForSimulatedTrace：小时债 -0.85×超额', () => {
    const u = estimateUtilityDeltaForSimulatedTrace({
      reason: 'FATIGUE_EXHAUSTION',
      metrics: {
        fatigue_score01: 0.8,
        fatigue_weight: 0.5,
        base_limit: 5,
        effective_limit: 5,
        actual_cost: 7,
        unit: 'h',
      },
    });
    expect(u).toBeCloseTo(-0.85 * 2, 5);
  });

  it('estimateUtilityDeltaForSimulatedTrace：bool 地形命中 -12', () => {
    const u = estimateUtilityDeltaForSimulatedTrace({
      reason: 'HISTORICAL_BOUNDARY_HIT',
      metrics: {
        fatigue_score01: 0.35,
        fatigue_weight: 1,
        base_limit: 1,
        effective_limit: 1,
        actual_cost: 0,
        unit: 'bool',
      },
    });
    expect(u).toBe(-12);
  });

  it('buildHistoricalBoundarySimulations 产出带 estimated_utility_delta 与 metrics.utility_delta', () => {
    const traces = buildHistoricalBoundarySimulations({
      tripPlanRequest: {
        message: 'f-road highlands',
        constraints: { vehicle_type: '2WD' },
      },
      detectRingRoadIntent: () => false,
    });
    const t = traces.find((x) => x.simulation.boundary_id === 'terrain_high_risk');
    expect(t).toBeDefined();
    expect(typeof t!.estimated_utility_delta).toBe('number');
    expect(t!.metrics.utility_delta).toBe(t!.estimated_utility_delta);
    expect(t!.estimated_utility_delta).toBe(-12);
  });
});
