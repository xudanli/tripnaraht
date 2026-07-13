import { readWeatherConditionForTraversability } from './road-traversability-weather.util';
import { RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY } from '../../../decision-runtime/monitoring/config/iceland-vedur-monitoring.config';

describe('readWeatherConditionForTraversability', () => {
  it('prefers drill precipitation override', () => {
    const result = readWeatherConditionForTraversability({
      tripMetadata: {
        roadTraversabilityDrill: { precipitation: 'rain' },
        [RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY]: {
          byDayRegion: {
            '1:IS_SOUTH': {
              envelope: { value: { condition: 'sunny' } },
              windSpeedKmh: 10,
              observedAt: '2026-07-10T10:00:00Z',
            },
          },
        },
      },
    });
    expect(result.precipitation).toBe('rain');
  });

  it('maps vedur rainy condition to precipitation rain', () => {
    const result = readWeatherConditionForTraversability({
      tripMetadata: {
        [RFC001_VEDUR_WEATHER_EVIDENCE_METADATA_KEY]: {
          byDayRegion: {
            '2:IS_SOUTH': {
              envelope: { value: { condition: 'rainy' } },
              windSpeedKmh: 22,
              windGustKmh: 35,
              observedAt: '2026-07-10T12:00:00Z',
            },
          },
        },
      },
      dayIndex: 2,
    });
    expect(result.precipitation).toBe('rain');
    expect(result.windSpeedKmh).toBeUndefined();
  });

  it('falls back to active weather.hazard assertion wind', () => {
    const result = readWeatherConditionForTraversability({
      tripMetadata: {},
      worldAssertions: [
        {
          assertionId: 'wsa_weather_1',
          subjectRef: { kind: 'REGION', id: 'IS_SOUTH' },
          predicate: 'weather.hazard',
          payload: { regionId: 'IS_SOUTH', windSpeedKmh: 55, windGustKmh: 70 },
          source: { provider: 'iceland_met', sourceType: 'OFFICIAL', evidenceRefs: [] },
          observedAt: '2026-07-10T10:00:00Z',
          validFrom: '2026-07-10T10:00:00Z',
          confidence: 0.9,
          status: 'ACTIVE',
          version: 1,
        },
      ],
    });
    expect(result.precipitation).toBe('none');
    expect(result.windSpeedKmh).toBe(55);
    expect(result.windGustKmh).toBe(70);
  });
});
