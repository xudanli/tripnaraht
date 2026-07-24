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
    expect(t!.estimated_utility_delta).toBe(-10);
  });

  it('极昼马拉松 SKU 驱动 FATIGUE_OVERLOAD 仿真 trace', () => {
    const msg = '想利用极昼，不间断连续自驾环岛';
    const traces = buildHistoricalBoundarySimulations({
      tripPlanRequest: { message: msg },
      detectRingRoadIntent: () => true,
    });
    const t = traces.find((x) => x.reason === 'FATIGUE_OVERLOAD');
    expect(t).toBeDefined();
    expect(t!.estimated_utility_delta).toBe(-25);
  });

  it('旺季错峰 SKU 驱动 ETA_INFEASIBLE 仿真 trace', () => {
    const msg =
      '6月25号下午我们到北部的胡萨维克，想安排一场观鲸，晚上住在阿克雷里，希望避开白天的旅游大巴人潮。';
    const traces = buildHistoricalBoundarySimulations({
      tripPlanRequest: { message: msg },
      detectRingRoadIntent: () => false,
    });
    const t = traces.find((x) => x.reason === 'ETA_INFEASIBLE');
    expect(t).toBeDefined();
    expect(t!.estimated_utility_delta).toBe(-20);
  });

  it('Yaris F208：意图 SKU 驱动地形仿真 trace（与公理 anchor 对齐）', () => {
    const msg =
      '外头写着F208公路开了，我们打算6月18号租一辆普通的丰田 Yaris，走 F208 北线横穿内陆高地去兰曼纳劳卡。';
    const traces = buildHistoricalBoundarySimulations({
      tripPlanRequest: { message: msg },
      detectRingRoadIntent: () => false,
    });
    const t = traces.find((x) => x.reason === 'TERRAIN_F_ROAD_UNFIT');
    expect(t).toBeDefined();
    expect(t!.estimated_utility_delta).toBe(-10);
  });
});
