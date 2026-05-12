import { classifyWeatherOperationalSeverity } from './iceland-weather-operational-classifier.util';

describe('classifyWeatherOperationalSeverity', () => {
  it('flags 22 m/s wind as avoid_nonessential', () => {
    const r = classifyWeatherOperationalSeverity({ windSpeed: 22 });
    expect(r.travelRisk).toBe('avoid_nonessential');
    expect(r.drivingRecommendation.length).toBeGreaterThan(0);
  });

  it('treats freezing rain codes as avoid_nonessential', () => {
    const r = classifyWeatherOperationalSeverity({ weatherCode: '66' });
    expect(r.travelRisk).toBe('avoid_nonessential');
  });

  it('uses caution for moderate wind and visibility', () => {
    const r = classifyWeatherOperationalSeverity({ windSpeed: 13, visibility: 4000 });
    expect(r.travelRisk).toBe('caution');
  });
});
