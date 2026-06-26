import { OpenMeteoWeatherAdapter } from './open-meteo-weather.adapter';

describe('OpenMeteoWeatherAdapter', () => {
  it('maps Open-Meteo current weather into standard weather data', async () => {
    const adapter = new OpenMeteoWeatherAdapter();
    const getMock = jest.fn().mockResolvedValue({
      data: {
        timezone: 'Atlantic/Reykjavik',
        current: {
          time: '2026-06-13T12:00',
          temperature_2m: 7.2,
          relative_humidity_2m: 82,
          apparent_temperature: 4.9,
          precipitation: 6.2,
          weather_code: 61,
          cloud_cover: 91,
          wind_speed_10m: 19.4,
          wind_direction_10m: 30,
        },
      },
    });
    (adapter as any).httpClient = { get: getMock };

    const result = await adapter.getWeather({
      lat: 64.1466,
      lng: -21.9426,
      timezone: 'Atlantic/Reykjavik',
    });

    expect(getMock).toHaveBeenCalledWith('/forecast', {
      params: {
        latitude: 64.1466,
        longitude: -21.9426,
        current: expect.stringContaining('temperature_2m'),
        wind_speed_unit: 'ms',
        precipitation_unit: 'mm',
        timezone: 'Atlantic/Reykjavik',
      },
    });
    expect(result).toMatchObject({
      source: 'open-meteo',
      temperature: 7.2,
      feelsLikeTemperature: 4.9,
      condition: 'rainy',
      windSpeed: 19.4,
      windDirection: 30,
      humidity: 82,
      metadata: {
        sourceAuthority: 'open-data',
        providerName: 'Open-Meteo',
        precipitation: 6.2,
        cloudCover: 91,
      },
    });
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'wind', severity: 'warning' }),
        expect.objectContaining({ type: 'precipitation', severity: 'warning' }),
      ]),
    );
  });

  it('maps Open-Meteo daily forecast into standard daily rows', async () => {
    const adapter = new OpenMeteoWeatherAdapter();
    const getMock = jest.fn().mockResolvedValue({
      data: {
        daily: {
          time: ['2026-06-13', '2026-06-14'],
          weather_code: [61, 3],
          temperature_2m_max: [9, 11],
          temperature_2m_min: [4, 5],
          precipitation_sum: [8.2, 1.1],
          wind_speed_10m_max: [22, 12],
          wind_gusts_10m_max: [28, 16],
        },
      },
    });
    (adapter as any).httpClient = { get: getMock };

    const result = await adapter.getDailyForecast({
      lat: 64.1466,
      lng: -21.9426,
      startDate: '2026-06-13',
      endDate: '2026-06-14',
      timezone: 'Atlantic/Reykjavik',
    });

    expect(getMock).toHaveBeenCalledWith('/forecast', {
      params: expect.objectContaining({
        latitude: 64.1466,
        longitude: -21.9426,
        start_date: '2026-06-13',
        end_date: '2026-06-14',
        daily: expect.stringContaining('weather_code'),
      }),
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      date: '2026-06-13',
      condition: 'rainy',
      temperatureMin: 4,
      temperatureMax: 9,
      windSpeedMax: 22,
      source: 'open-meteo',
    });
    expect(result[0].alerts?.length).toBeGreaterThan(0);
  });
});
