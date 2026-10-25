import { AdminWeatherSourceBridge } from './admin-weather-source-bridge.service';

describe('AdminWeatherSourceBridge', () => {
  const adapterName = 'OpenWeather (Default)';

  function createBridge(opts?: {
    enabledRows?: Array<{ sourceId: string; enabled: boolean; baseUrl?: string }>;
    getWeather?: jest.Mock;
  }) {
    const getWeather =
      opts?.getWeather ??
      jest.fn(async () => ({
        temperature: 3.5,
        condition: 'cloudy',
        source: 'openweather',
      }));
    const setBaseUrl = jest.fn();
    const adapter: any = {
      getName: () => adapterName,
      getWeather,
      setBaseUrl,
      getBaseUrl: () => 'https://api.openweathermap.org/data/2.5',
    };
    const prisma: any = {
      physicalDomainDataSourceConfig: {
        findMany: jest.fn(async () => opts?.enabledRows ?? []),
      },
    };
    const bridge = new AdminWeatherSourceBridge(prisma, adapter);
    return { bridge, adapter, getWeather, setBaseUrl, prisma };
  }

  it('treats unmapped adapters as enabled', () => {
    const { bridge } = createBridge();
    expect(bridge.isEnabled('Open-Meteo')).toBe(true);
  });

  it('applyRuntime toggles enabled and baseUrl', () => {
    const { bridge, setBaseUrl } = createBridge();
    bridge.applyRuntime('weather-api', {
      enabled: false,
      baseUrl: 'https://example.test/weather',
    });
    expect(bridge.isEnabled(adapterName)).toBe(false);
    expect(setBaseUrl).toHaveBeenCalledWith('https://example.test/weather');
  });

  it('probe short-circuits when disabled', async () => {
    const { bridge, getWeather } = createBridge();
    bridge.applyRuntime('weather-api', { enabled: false });
    const result = await bridge.probe('weather-api');
    expect(result.ok).toBe(false);
    expect(result.detail).toBe('DISABLED');
    expect(getWeather).not.toHaveBeenCalled();
  });

  it('probe returns success detail from adapter weather', async () => {
    const { bridge } = createBridge();
    const result = await bridge.probe('weather-api');
    expect(result.ok).toBe(true);
    expect(result.detail).toContain('openweather');
    expect(result.detail).toContain('3.5C');
  });

  it('probe returns error detail when adapter throws', async () => {
    const { bridge } = createBridge({
      getWeather: jest.fn(async () => {
        throw new Error('API Key 无效');
      }),
    });
    const result = await bridge.probe('weather-api');
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('API Key 无效');
  });

  it('onModuleInit applies stored configs', async () => {
    const { bridge, setBaseUrl } = createBridge({
      enabledRows: [
        {
          sourceId: 'weather-api',
          enabled: false,
          baseUrl: 'https://custom.openweather.test',
        },
      ],
    });
    await bridge.onModuleInit();
    expect(bridge.isEnabled(adapterName)).toBe(false);
    expect(setBaseUrl).toHaveBeenCalledWith('https://custom.openweather.test');
  });
});
