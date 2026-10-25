/**
 * Unit tests for evidence precedence (Strong Wind P0-2 contract).
 */

import {
  peakWindFromWeatherEvidence,
  resolveDecisionWindSpeedMps,
  resolveWindFromPhysicalReality,
} from './evidence-precedence.util';

describe('evidence-precedence.util', () => {
  it('authority > weatherEvidence > seasonal', () => {
    expect(
      resolveDecisionWindSpeedMps({
        authorityWindMps: 27,
        weatherEvidenceWindMps: 22,
        seasonalTypicalWindMps: 12,
      })?.windSpeedMps,
    ).toBe(27);

    expect(
      resolveDecisionWindSpeedMps({
        weatherEvidenceWindMps: 22,
        seasonalTypicalWindMps: 12,
      })?.band,
    ).toBe('REALTIME_OBSERVATION');

    expect(
      resolveDecisionWindSpeedMps({
        seasonalTypicalWindMps: 12,
      })?.band,
    ).toBe('SEASONAL_PRIOR');
  });

  it('peakWindFromWeatherEvidence uses gust when higher', () => {
    expect(
      peakWindFromWeatherEvidence([
        { windSpeedMs: 18, windGustMs: 27 },
        { windSpeedMs: 20 },
      ]),
    ).toBe(27);
  });

  it('resolveWindFromPhysicalReality prefers weatherEvidence over seasonal', () => {
    const r = resolveWindFromPhysicalReality({
      weatherEvidence: [{ windSpeedMs: 27 }],
      climateSeasonality: {
        typicalWeather: { windSpeedMps: 12 },
      },
    });
    expect(r?.windSpeedMps).toBe(27);
    expect(r?.band).toBe('REALTIME_OBSERVATION');
  });
});
