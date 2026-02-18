/**
 * WorldStateSummary 单元测试（Scheme C）
 */

import { buildWorldStateSummaryFromDso } from './world-state-summary.types';

describe('buildWorldStateSummaryFromDso', () => {
  it('空 state 应返回空对象', () => {
    const result = buildWorldStateSummaryFromDso({});
    expect(result).toEqual({});
  });

  it('仅有 environmentState 时应输出 physical 和 route', () => {
    const result = buildWorldStateSummaryFromDso({
      environmentState: {
        countryCode: 'IS',
        month: 6,
        weatherRisk: 0.3,
        routeDirectionId: 'rd-golden-circle',
      },
    });
    expect(result.physical).toBeDefined();
    expect(result.physical?.countryCode).toBe('IS');
    expect(result.physical?.month).toBe(6);
    expect(result.physical?.climateSeasonality?.accessibilityScore).toBe(0.7); // 1 - 0.3
    expect(result.route).toBeDefined();
    expect(result.route?.routeDirectionId).toBe('rd-golden-circle');
  });

  it('仅有 userIntent.party 时应输出 human', () => {
    const result = buildWorldStateSummaryFromDso({
      userIntent: {
        party: { count: 2, fitnessLevel: 'high', riskTolerance: 'MEDIUM' },
      },
    });
    expect(result.human).toBeDefined();
    expect(result.human?.fitnessLevel).toBe('high');
    expect(result.human?.riskTolerance).toBe('MEDIUM');
    expect(result.human?.partyCount).toBe(2);
  });

  it('完整 state 应输出三段式', () => {
    const result = buildWorldStateSummaryFromDso({
      environmentState: { countryCode: 'IS', month: 8, routeDirectionId: 'rd-1' },
      userIntent: { party: { count: 1, riskTolerance: 'LOW' }, constraints: {} },
    });
    expect(result.physical).toBeDefined();
    expect(result.human).toBeDefined();
    expect(result.route).toBeDefined();
  });

  it('weatherRisk 高时应计算较低 accessibilityScore', () => {
    const result = buildWorldStateSummaryFromDso({
      environmentState: { weatherRisk: 0.9 },
    });
    expect(result.physical?.climateSeasonality?.accessibilityScore).toBe(0.1); // Math.max(0.1, 1-0.9)
  });

  it('P3: researchData 补全 hazardZones、demEvidence', () => {
    const result = buildWorldStateSummaryFromDso(
      { environmentState: { countryCode: 'IS' } },
      {
        risk_assessment: { hazardZones: [{ type: 'AVALANCHE', level: 'HIGH' }] },
        dem_metrics: { elevation_profile: [0, 100], max_slope_pct: 12 },
      },
    );
    expect(result.physical?.hazardZones).toHaveLength(1);
    expect(result.physical?.hazardZones?.[0]).toEqual({ type: 'AVALANCHE', level: 'HIGH' });
    expect(result.physical?.demEvidence?.maxSlope).toBe(12);
  });

  it('P3: worldModelContext 优先于 researchData', () => {
    const result = buildWorldStateSummaryFromDso(
      { environmentState: { countryCode: 'IS' } },
      {},
      {
        physical: { countryCode: 'NO', month: 8, hazardZones: [{ type: 'ICE', level: 'MEDIUM' }] },
        human: { riskTolerance: 'LOW', preferredPace: 'relaxed' },
        routeDirection: { id: 'rd-1', philosophy: 'Safety first' },
      },
    );
    expect(result.physical?.countryCode).toBe('NO');
    expect(result.physical?.hazardZones?.[0]).toEqual({ type: 'ICE', level: 'MEDIUM' });
    expect(result.human?.riskTolerance).toBe('LOW');
    expect(result.route?.routeDirectionId).toBe('rd-1');
  });
});
