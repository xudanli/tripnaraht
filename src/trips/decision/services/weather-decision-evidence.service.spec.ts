import { WeatherDecisionEvidenceService } from './weather-decision-evidence.service';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import type { ExtendedWeatherData } from '../../../data-contracts/interfaces/weather.interface';

describe('WeatherDecisionEvidenceService (P0 real weather)', () => {
  let router: jest.Mocked<Pick<DataSourceRouterService, 'getWeather'>>;
  let service: WeatherDecisionEvidenceService;

  beforeEach(() => {
    router = { getWeather: jest.fn() };
    service = new WeatherDecisionEvidenceService(router as unknown as DataSourceRouterService);
  });

  const sampleWeather = (over: Partial<ExtendedWeatherData> = {}): ExtendedWeatherData => ({
    temperature: 4,
    condition: 'windy',
    windSpeed: 10,
    windDirection: 90,
    windGust: 12,
    visibility: 8000,
    lastUpdated: new Date(),
    source: 'apis.is',
    metadata: { precipitation: 2 },
    ...over,
  });

  it('calls DataSourceRouter.getWeather instead of mock PRNG', async () => {
    router.getWeather.mockResolvedValue(sampleWeather());

    const result = await service.generateEvidencePipeline(
      {
        version: '1',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-06-01',
            timeSlots: [
              {
                id: 's1',
                time: '09:00',
                title: 'Drive',
                type: 'transport',
                coordinates: { lat: 64.15, lng: -21.95 },
              },
            ],
          },
        ],
      },
      undefined,
      undefined,
    );

    expect(router.getWeather).toHaveBeenCalledTimes(1);
    expect(router.getWeather).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 64.15,
        lng: -21.95,
        includeWindDetails: true,
      }),
    );
    expect(result.segmentEvidences).toHaveLength(1);
    expect(result.segmentEvidences[0].metadata?.weatherSource).toBe('apis.is');
    expect(result.segmentEvidences[0].metadata?.windGustMs).toBe(12);
  });

  it('uses fallback coordinates when slots have no coordinates', async () => {
    router.getWeather.mockResolvedValue(sampleWeather());

    await service.generateEvidencePipeline(
      {
        version: '1',
        createdAt: new Date().toISOString(),
        days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
      },
      undefined,
      { fallbackLat: 64.0, fallbackLng: -19.0 },
    );

    expect(router.getWeather).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 64.0, lng: -19.0 }),
    );
  });

  it('returns HARD evidence when location anchor is missing', async () => {
    const result = await service.generateEvidencePipeline({
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
    });

    expect(router.getWeather).not.toHaveBeenCalled();
    expect(result.segmentEvidences[0].violation).toBe('HARD');
    expect(result.segmentEvidences[0].metadata?.fetchError).toBe('MISSING_LOCATION_ANCHOR');
  });
});
