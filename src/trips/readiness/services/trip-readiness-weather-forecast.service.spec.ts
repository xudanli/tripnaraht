import { TripReadinessWeatherForecastService } from './trip-readiness-weather-forecast.service';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';

describe('TripReadinessWeatherForecastService', () => {
  const router = {
    getDailyWeatherForecastEvidence: jest.fn(),
  } as unknown as DataSourceRouterService;

  const service = new TripReadinessWeatherForecastService(router);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns beyond_horizon when trip starts after forecast window', async () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);

    const result = await service.buildForecastRisksForTrip(
      {
        startDate: farFuture,
        endDate: farFuture,
        TripDay: [
          {
            ItineraryItem: [
              {
                Place: {
                  metadata: { lat: 64.15, lng: -21.94 },
                },
              },
            ],
          },
        ],
      },
      'zh',
    );

    expect(result.risks).toHaveLength(0);
    expect(result.summary.available).toBe(false);
    expect(result.summary.reason).toBe('beyond_horizon');
    expect(router.getDailyWeatherForecastEvidence).not.toHaveBeenCalled();
  });

  it('builds consolidated forecast risk when API returns daily rows', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    (router.getDailyWeatherForecastEvidence as jest.Mock).mockResolvedValue([
      {
        factType: 'WEATHER',
        entityRef: { kind: 'REGION', id: 'coord:64.15,-21.94' },
        value: {
          date: today.toISOString().slice(0, 10),
          condition: 'rainy',
          temperatureMin: 3,
          temperatureMax: 8,
          windSpeedMax: 22,
          windGustMax: 28,
          precipitationSum: 6,
          source: 'open-meteo',
          alerts: [{ type: 'wind', severity: 'warning', title: '强风', description: '最大风速 22 m/s' }],
        },
        source: 'open-meteo',
        observedAt: new Date().toISOString(),
        validUntil: `${today.toISOString().slice(0, 10)}T23:59:59.999Z`,
        confidence: 0.78,
        freshness: { status: 'FRESH', strongJudgmentAllowed: true, ageMs: 0 },
      },
    ]);

    const result = await service.buildForecastRisksForTrip(
      {
        startDate: today,
        endDate: tomorrow,
        TripDay: [
          {
            date: today,
            ItineraryItem: [
              {
                Place: {
                  metadata: { lat: 64.15, lng: -21.94 },
                },
              },
            ],
          },
        ],
      },
      'zh',
    );

    expect(router.getDailyWeatherForecastEvidence).toHaveBeenCalled();
    expect(result.summary.available).toBe(true);
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].sourceType).toBe('weather_forecast');
    expect(result.risks[0].message).toContain('雨');
  });

  it('drops generic weather risks when forecast is merged', () => {
    const merged = service.mergeForecastIntoRisks(
      [
        { type: 'weather_extreme', category: 'weather', isGenericTemplate: true, id: 'generic' },
        { type: 'terrain', category: 'terrain', id: 'terrain-1' },
      ],
      [{ type: 'weather_extreme', category: 'weather', id: 'forecast-1' } as any],
    );

    expect(merged.map((r) => r.id)).toEqual(['forecast-1', 'terrain-1']);
  });
});
