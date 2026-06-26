import {
  dataReliabilityFindingsToVerificationIssues,
  evaluateDataReliability,
} from './data-reliability-gate';

describe('data-reliability-gate', () => {
  const nowMs = Date.parse('2026-06-14T10:00:00.000Z');

  it('marks stale evidence as confidence degraded', () => {
    const result = evaluateDataReliability(
      {} as any,
      {
        requestId: 'r1',
        researchData: {
          __data_reliability_evidence: [
            {
              id: 'weather_old',
              factType: 'WEATHER',
              entityRef: { type: 'DESTINATION', id: 'IS' },
              value: { wind: 18 },
              source: { provider: 'weather_forecast', sourceType: 'COMMERCIAL' },
              observedAt: '2026-06-13T00:00:00.000Z',
              confidence: 0.9,
              freshnessTtlSec: 60 * 60,
            },
          ],
        },
      },
      { nowMs },
    );

    expect(result.evidence).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].kind).toBe('STALE');
    expect(result.confidenceDelta).toBeLessThan(0);

    const issues = dataReliabilityFindingsToVerificationIssues(result.findings, new Date(nowMs).toISOString());
    expect(issues[0].code).toBe('CONFIDENCE_DEGRADED');
    expect(issues[0].class).toBe('ADVISORY');
  });

  it('accepts fresh evidence without findings', () => {
    const result = evaluateDataReliability(
      {} as any,
      {
        requestId: 'r1',
        researchData: {
          weather_forecast: {
            evidence_id: 'weather_fresh',
            source: 'weather_forecast',
            retrieved_at: '2026-06-14T09:30:00.000Z',
            confidence: 0.8,
          },
        },
      },
      { nowMs },
    );

    expect(result.evidence.map((e) => e.id)).toContain('weather_fresh');
    expect(result.findings).toEqual([]);
  });
});
