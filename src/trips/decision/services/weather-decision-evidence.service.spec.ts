import { WeatherDecisionEvidenceService } from './weather-decision-evidence.service';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import type { ExtendedWeatherData } from '../../../data-contracts/interfaces/weather.interface';
import type { EvidenceEnvelopeWithFreshness } from '../../../data-contracts/mappers/evidence-envelope.mapper';
import { travelEntityRefFromCoordinates } from '../../../data-contracts/mappers/evidence-envelope.mapper';

describe('WeatherDecisionEvidenceService (P0 real weather)', () => {
  let router: jest.Mocked<Pick<DataSourceRouterService, 'getWeatherEvidence'>>;
  let service: WeatherDecisionEvidenceService;

  beforeEach(() => {
    router = { getWeatherEvidence: jest.fn() };
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

  const sampleEnvelope = (
    weather: ExtendedWeatherData,
    freshness: EvidenceEnvelopeWithFreshness<ExtendedWeatherData>['freshness'] = {
      status: 'FRESH',
      strongJudgmentAllowed: true,
      ageMs: 0,
    },
  ): EvidenceEnvelopeWithFreshness<ExtendedWeatherData> => ({
    factType: 'WEATHER',
    entityRef: travelEntityRefFromCoordinates(64.15, -21.95),
    value: weather,
    source: weather.source,
    observedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 3600000).toISOString(),
    confidence: 0.85,
    freshness,
  });

  it('calls DataSourceRouter.getWeatherEvidence instead of mock PRNG', async () => {
    router.getWeatherEvidence.mockResolvedValue(sampleEnvelope(sampleWeather()));

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

    expect(router.getWeatherEvidence).toHaveBeenCalledTimes(1);
    expect(router.getWeatherEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 64.15,
        lng: -21.95,
        includeWindDetails: true,
      }),
    );
    expect(result.segmentEvidences).toHaveLength(1);
    expect(result.segmentEvidences[0].metadata?.weatherSource).toBe('apis.is');
    expect(result.segmentEvidences[0].metadata?.windGustMs).toBe(12);
    expect(result.segmentEvidences[0].metadata?.strongJudgmentAllowed).toBe(true);
  });

  it('uses fallback coordinates when slots have no coordinates', async () => {
    router.getWeatherEvidence.mockResolvedValue(sampleEnvelope(sampleWeather()));

    await service.generateEvidencePipeline(
      {
        version: '1',
        createdAt: new Date().toISOString(),
        days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
      },
      undefined,
      { fallbackLat: 64.0, fallbackLng: -19.0 },
    );

    expect(router.getWeatherEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 64.0, lng: -19.0 }),
    );
  });

  it('returns HARD evidence when location anchor is missing', async () => {
    const result = await service.generateEvidencePipeline({
      version: '1',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-06-01', timeSlots: [] }],
    });

    expect(router.getWeatherEvidence).not.toHaveBeenCalled();
    expect(result.segmentEvidences[0].violation).toBe('HARD');
    expect(result.segmentEvidences[0].metadata?.fetchError).toBe('MISSING_LOCATION_ANCHOR');
  });

  it('downgrades HARD violation when evidence is stale', async () => {
    router.getWeatherEvidence.mockResolvedValue(
      sampleEnvelope(
        sampleWeather({ windSpeed: 30, windGust: 35 }),
        { status: 'STALE', strongJudgmentAllowed: false, ageMs: 999999, reason: 'older than TTL' },
      ),
    );

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

    expect(result.segmentEvidences[0].violation).toBe('SOFT');
    expect(result.segmentEvidences[0].executionState).toBe('DEGRADED');
    expect(result.segmentEvidences[0].metadata?.strongJudgmentAllowed).toBe(false);
  });
});
