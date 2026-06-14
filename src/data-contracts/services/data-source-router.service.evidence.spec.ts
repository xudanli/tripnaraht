import { DataSourceRouterService } from './data-source-router.service';
import type { RoadStatusAdapter } from '../adapters/road-status.adapter.interface';
import type { WeatherAdapter } from '../adapters/weather.adapter.interface';

describe('DataSourceRouterService evidence wrappers', () => {
  let router: DataSourceRouterService;

  const weatherAdapter: WeatherAdapter = {
    getName: () => 'test-weather',
    getPriority: () => 1,
    getSupportedCountries: () => ['*'],
    getWeather: jest.fn().mockResolvedValue({
      temperature: 5,
      condition: 'cloudy',
      lastUpdated: new Date('2026-06-14T10:00:00.000Z'),
      source: 'open-meteo',
    }),
    getDailyForecast: jest.fn().mockResolvedValue([
      { date: '2026-06-15', condition: 'rainy', source: 'open-meteo' },
    ]),
  };

  const roadAdapter: RoadStatusAdapter = {
    getName: () => 'test-road',
    getPriority: () => 1,
    getSupportedCountries: () => ['*'],
    getRoadStatus: jest.fn().mockResolvedValue({
      isOpen: true,
      riskLevel: 0,
      lastUpdated: new Date('2026-06-14T10:00:00.000Z'),
      source: 'default',
    }),
    getRoadStatuses: jest.fn(),
  };

  beforeEach(() => {
    router = new DataSourceRouterService();
    router.registerWeatherAdapter(weatherAdapter);
    router.registerRoadStatusAdapter(roadAdapter);
  });

  it('wraps getWeather as EvidenceEnvelope with freshness', async () => {
    const envelope = await router.getWeatherEvidence({ lat: 40.0, lng: 116.0 });
    expect(envelope.factType).toBe('WEATHER');
    expect(envelope.value.temperature).toBe(5);
    expect(envelope.freshness).toBeDefined();
    expect(envelope.entityRef.id).toContain('coord:');
  });

  it('wraps getRoadStatus as EvidenceEnvelope with freshness', async () => {
    (roadAdapter.getRoadStatus as jest.Mock).mockResolvedValueOnce({
      isOpen: true,
      riskLevel: 0,
      lastUpdated: new Date(),
      source: 'default',
    });
    const envelope = await router.getRoadStatusEvidence({ lat: 64.1, lng: -21.9 });
    expect(envelope.factType).toBe('ROAD');
    expect(envelope.value.isOpen).toBe(true);
    expect(envelope.freshness.strongJudgmentAllowed).toBe(true);
  });

  it('wraps daily forecast rows as evidence envelopes', async () => {
    const rows = await router.getDailyWeatherForecastEvidence({
      lat: 64.1,
      lng: -21.9,
      startDate: '2026-06-15',
      endDate: '2026-06-15',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].factType).toBe('WEATHER');
    expect(rows[0].value.date).toBe('2026-06-15');
  });
});
