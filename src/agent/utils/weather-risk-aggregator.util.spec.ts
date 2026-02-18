/**
 * 天气风险聚合工具单元测试
 */
import { aggregateWeatherRisk } from './weather-risk-aggregator.util';

describe('aggregateWeatherRisk', () => {
  it('无数据时返回 undefined', () => {
    expect(aggregateWeatherRisk({})).toBeUndefined();
    expect(aggregateWeatherRisk({ foo: 'bar' })).toBeUndefined();
  });

  it('从 failure_risk_prediction 聚合（weather 在 riskFactors）', () => {
    const data = {
      failure_risk_prediction: {
        predictions: [
          { day: 1, riskLevel: 'HIGH', riskFactors: ['weather'] },
          { day: 2, riskLevel: 'LOW', riskFactors: ['weather'] },
        ],
      },
    };
    const r = aggregateWeatherRisk(data);
    expect(r).toBeDefined();
    expect(r).toBeGreaterThan(0.3);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('从 weather_predictions 聚合（高风速、降水）', () => {
    const data = {
      weather_predictions: [
        { windSpeed: 25, precipitation: 15, visibility: 800 },
        { windSpeed: 10, precipitation: 2, visibility: 10000 },
      ],
    };
    const r = aggregateWeatherRisk(data);
    expect(r).toBeDefined();
    expect(r).toBeGreaterThan(0.2);
  });

  it('从 weather_forecast 聚合（travel_suitability POOR）', () => {
    const data = {
      weather_forecast: {
        forecasts: [
          { travel_suitability: 'POOR' },
          { travel_suitability: 'POOR' },
        ],
      },
    };
    const r = aggregateWeatherRisk(data);
    expect(r).toBeDefined();
    expect(r).toBeGreaterThan(0.4);
  });

  it('多源取最高值', () => {
    const data = {
      failure_risk_prediction: {
        predictions: [{ day: 1, riskLevel: 'LOW', riskFactors: ['weather'] }],
      },
      weather_forecast: {
        forecasts: [{ travel_suitability: 'DANGEROUS' }],
      },
    };
    const r = aggregateWeatherRisk(data);
    expect(r).toBeDefined();
    expect(r).toBeGreaterThan(0.7);
  });
});
