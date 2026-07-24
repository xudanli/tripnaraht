import {
  canFallbackSourceModifyVedurRisk,
  canSourceRecoverWeatherProblem,
  getWeatherSourceTransitionLog,
  recordWeatherSourceTransition,
  resetWeatherSourceTransitionLogForTests,
} from './weather-source-authority.util';

describe('weather-source-authority.util', () => {
  afterEach(() => {
    resetWeatherSourceTransitionLogForTests();
  });

  it('blocks Open-Meteo from downgrading active Vedur PROHIBITED risk', () => {
    expect(
      canFallbackSourceModifyVedurRisk({
        nextSourceProvider: 'global_weather',
        previousSourceProvider: 'iceland_met',
        previousWeatherSource: 'vedur.is',
        previousRiskTier: 'PROHIBITED',
        nextRiskTier: 'CALM',
        previousValidUntil: new Date(Date.now() + 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it('allows Open-Meteo CALM when previous Vedur assertion expired', () => {
    expect(
      canFallbackSourceModifyVedurRisk({
        nextSourceProvider: 'global_weather',
        previousSourceProvider: 'iceland_met',
        previousWeatherSource: 'vedur.is',
        previousRiskTier: 'PROHIBITED',
        nextRiskTier: 'CALM',
        previousValidUntil: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  it('only Vedur may drive calm recovery', () => {
    expect(canSourceRecoverWeatherProblem('iceland_met')).toBe(true);
    expect(canSourceRecoverWeatherProblem('global_weather')).toBe(false);
  });

  it('records source transition events', () => {
    recordWeatherSourceTransition({
      tripId: 't1',
      dayIndex: 1,
      from: 'VEDUR_LIVE',
      to: 'OPEN_METEO_FALLBACK',
      reason: 'timeout',
      weatherSource: 'open-meteo',
      sourceProvider: 'global_weather',
    });
    expect(getWeatherSourceTransitionLog()).toHaveLength(1);
  });
});
