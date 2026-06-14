import { IcelandWeatherAdapter } from './iceland-weather.adapter';

describe('IcelandWeatherAdapter', () => {
  it('maps official Vedur.is XML observations into standard weather data', async () => {
    const adapter = new IcelandWeatherAdapter();
    const getMock = jest.fn().mockResolvedValue({
      data: `
        <observations>
          <station id="1" valid="1">
            <name>Reykjavik</name>
            <time>2026-06-13 12:00:00</time>
            <T>6.4</T>
            <F>12</F>
            <FX>18</FX>
            <FG>26.5</FG>
            <D>NNE</D>
            <W>Light rain</W>
            <V>0.8</V>
            <N>88</N>
            <P>1002.4</P>
            <RH>91</RH>
            <TD>5.1</TD>
            <R>1.2</R>
          </station>
        </observations>
      `,
    });
    (adapter as any).httpClient = { get: getMock };

    const result = await adapter.getWeather({
      lat: 64.147,
      lng: -21.9408,
      includeWindDetails: true,
    });

    expect(getMock).toHaveBeenCalledWith('/', {
      params: {
        op_w: 'xml',
        type: 'obs',
        lang: 'en',
        view: 'xml',
        ids: '1',
      },
      responseType: 'text',
      transformResponse: [expect.any(Function)],
    });
    expect(result.source).toBe('vedur.is');
    expect(result.temperature).toBe(6.4);
    expect(result.windSpeed).toBe(12);
    expect(result.windGust).toBe(26.5);
    expect(result.windDirection).toBe(22.5);
    expect(result.visibility).toBe(800);
    expect(result.metadata).toMatchObject({
      stationName: 'Reykjavik',
      stationId: '1',
      sourceAuthority: 'official',
      providerName: 'Icelandic Meteorological Office',
      endpoint: 'https://xmlweather.vedur.is',
      precipitation: 1.2,
    });
    expect(result.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'wind',
          severity: 'critical',
        }),
        expect.objectContaining({
          type: 'visibility',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('throws on malformed official XML so the router can fall back', async () => {
    const adapter = new IcelandWeatherAdapter();
    (adapter as any).httpClient = {
      get: jest.fn().mockResolvedValue({ data: '<observations></observations>' }),
    };

    await expect(adapter.getWeather({ lat: 64.147, lng: -21.9408 })).rejects.toThrow(
      'Vedur.is 未返回观测站数据',
    );
  });
});
