import { buildWeatherStrongWindRootCauseKey, parseWeatherStrongWindRootCauseKey } from './build-weather-strong-wind-root-cause-key.util';

describe('buildWeatherStrongWindRootCauseKey', () => {
  it('builds stable key without volatile fields', () => {
    const key = buildWeatherStrongWindRootCauseKey({
      tripId: 'trip_1',
      routeSegmentId: 'segment:trip_1:drive',
      weatherEpisodeId: 'ep_1',
    });
    expect(key).toBe('weather:strong-wind:trip_1:segment:trip_1:drive:ep_1');
  });

  it('round-trips parse', () => {
    const input = {
      tripId: 'trip_1',
      routeSegmentId: 'seg_a',
      weatherEpisodeId: 'ep_1',
    };
    const key = buildWeatherStrongWindRootCauseKey(input);
    expect(parseWeatherStrongWindRootCauseKey(key)).toEqual(input);
  });
});
