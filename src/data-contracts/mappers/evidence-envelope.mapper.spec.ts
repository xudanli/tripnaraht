import {
  travelEntityRefFromCoordinates,
  travelEntityRefFromRoadSegment,
  withFreshnessAssessment,
  wrapRoadStatusAsEnvelope,
  wrapWeatherDailyForecastAsEnvelope,
  wrapWeatherDataAsEnvelope,
} from './evidence-envelope.mapper';

describe('evidence-envelope.mapper', () => {
  const regionRef = travelEntityRefFromCoordinates(64.1466, -21.9426);

  it('wraps current weather with WEATHER factType and TTL', () => {
    const envelope = wrapWeatherDataAsEnvelope(
      {
        temperature: 7,
        condition: 'rainy',
        windSpeed: 12,
        lastUpdated: new Date('2026-06-14T10:00:00.000Z'),
        source: 'open-meteo',
      },
      regionRef,
    );

    expect(envelope.factType).toBe('WEATHER');
    expect(envelope.entityRef.kind).toBe('REGION');
    expect(envelope.source).toBe('open-meteo');
    expect(envelope.confidence).toBeGreaterThan(0.7);
    expect(envelope.validUntil).toBeDefined();
  });

  it('wraps daily forecast with date-bound validUntil', () => {
    const envelope = wrapWeatherDailyForecastAsEnvelope(
      {
        date: '2026-06-15',
        condition: 'cloudy',
        source: 'open-meteo',
      },
      regionRef,
      '2026-06-14T08:00:00.000Z',
    );

    expect(envelope.validUntil).toBe('2026-06-15T23:59:59.999Z');
    expect(envelope.observedAt).toBe('2026-06-14T08:00:00.000Z');
  });

  it('lowers road confidence for degraded/error fallback', () => {
    const segmentRef = travelEntityRefFromRoadSegment(
      { lat: 64.1, lng: -21.9 },
      { lat: 64.2, lng: -21.8 },
    );
    const envelope = wrapRoadStatusAsEnvelope(
      {
        isOpen: true,
        riskLevel: 1,
        lastUpdated: new Date('2026-06-14T10:00:00.000Z'),
        source: 'road.is',
        metadata: { networkError: true, note: 'API 调用失败，返回保守估计' },
      },
      segmentRef,
    );

    expect(envelope.factType).toBe('ROAD');
    expect(envelope.entityRef.kind).toBe('ROAD');
    expect(envelope.confidence).toBeLessThan(0.4);
  });

  it('attaches freshness assessment', () => {
    const now = Date.parse('2026-06-14T12:00:00.000Z');
    const wrapped = withFreshnessAssessment(
      wrapWeatherDataAsEnvelope(
        {
          temperature: 5,
          condition: 'cloudy',
          lastUpdated: new Date('2026-06-14T11:30:00.000Z'),
          source: 'open-meteo',
        },
        regionRef,
      ),
      now,
    );

    expect(wrapped.freshness.status).toBe('FRESH');
    expect(wrapped.freshness.strongJudgmentAllowed).toBe(true);
  });
});
