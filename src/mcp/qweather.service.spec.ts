import { QWeatherService } from './qweather.service';

jest.mock('axios', () => {
  const get = jest.fn();
  return {
    __esModule: true,
    default: {
      create: jest.fn(() => ({ get })),
    },
    __mockGet: get,
  };
});

const axiosMock = jest.requireMock('axios') as {
  __mockGet: jest.Mock;
};

describe('QWeatherService', () => {
  const prev = {
    key: process.env.QWEATHER_API_KEY,
    host: process.env.QWEATHER_API_HOST,
    enabled: process.env.QWEATHER_ENABLED,
  };

  beforeEach(() => {
    process.env.QWEATHER_API_KEY = 'test-key';
    process.env.QWEATHER_API_HOST = 'abcxyz.qweatherapi.com';
    process.env.QWEATHER_ENABLED = 'true';
    axiosMock.__mockGet.mockReset();
  });

  afterAll(() => {
    if (prev.key === undefined) delete process.env.QWEATHER_API_KEY;
    else process.env.QWEATHER_API_KEY = prev.key;
    if (prev.host === undefined) delete process.env.QWEATHER_API_HOST;
    else process.env.QWEATHER_API_HOST = prev.host;
    if (prev.enabled === undefined) delete process.env.QWEATHER_ENABLED;
    else process.env.QWEATHER_ENABLED = prev.enabled;
  });

  it('is unavailable without credentials', () => {
    delete process.env.QWEATHER_API_KEY;
    delete process.env.QWEATHER_API_HOST;
    const svc = new QWeatherService();
    expect(svc.isServiceAvailable()).toBe(false);
  });

  it('lookupCity maps geo results', async () => {
    axiosMock.__mockGet.mockResolvedValueOnce({
      data: {
        code: '200',
        location: [
          {
            id: '101010100',
            name: '北京',
            lat: '39.90',
            lon: '116.40',
            adm1: '北京市',
            country: '中国',
          },
        ],
      },
    });

    const svc = new QWeatherService();
    const rows = await svc.lookupCity('北京');
    expect(rows).toEqual([
      expect.objectContaining({
        id: '101010100',
        name: '北京',
        lat: 39.9,
        lon: 116.4,
      }),
    ]);
    expect(axiosMock.__mockGet).toHaveBeenCalledWith(
      'https://abcxyz.qweatherapi.com/geo/v2/city/lookup',
      expect.objectContaining({
        params: expect.objectContaining({ location: '北京', range: 'cn' }),
      }),
    );
  });

  it('getNow / getDaily7d / getWarningNow parse payloads', async () => {
    axiosMock.__mockGet
      .mockResolvedValueOnce({
        data: {
          code: '200',
          updateTime: '2026-08-10T12:00+08:00',
          now: { temp: '28', text: '晴', windSpeed: '12', humidity: '40' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: '200',
          daily: [{ fxDate: '2026-08-10', tempMax: '30', tempMin: '22', textDay: '晴' }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          code: '200',
          warning: [{ id: 'w1', title: '高温黄色预警', level: 'Yellow', typeName: '高温' }],
        },
      });

    const svc = new QWeatherService();
    await expect(svc.getNow('101010100')).resolves.toEqual(
      expect.objectContaining({ temp: 28, text: '晴', location: '101010100' }),
    );
    await expect(svc.getDaily7d('101010100')).resolves.toEqual([
      expect.objectContaining({ fxDate: '2026-08-10', tempMax: 30, textDay: '晴' }),
    ]);
    await expect(svc.getWarningNow('101010100')).resolves.toEqual([
      expect.objectContaining({ id: 'w1', title: '高温黄色预警' }),
    ]);
  });

  it('rejects non-200 API codes', async () => {
    axiosMock.__mockGet.mockResolvedValueOnce({ data: { code: '401' } });
    const svc = new QWeatherService();
    await expect(svc.getNow('101010100')).rejects.toThrow(/code=401/);
  });
});
