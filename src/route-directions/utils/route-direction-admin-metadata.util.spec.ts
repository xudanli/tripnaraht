import {
  mergeEnvironmentOverridesV1,
  mergeSegmentFactsV1,
  previewEnvironmentRisk,
} from './route-direction-admin-metadata.util';

describe('route-direction-admin-metadata.util', () => {
  it('upserts segment facts by roadId', () => {
    const out = mergeSegmentFactsV1(
      [{ roadId: 'F208', requires4x4: true, confidence: 0.5 }],
      [{ roadId: 'F208', requires4x4: false }, { roadId: 'Route 1' }] as any,
      'upsert',
    );
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.roadId === 'F208')?.requires4x4).toBe(false);
    expect(out.find((x) => x.roadId === 'Route 1')).toBeTruthy();
    expect(out.find((x) => x.roadId === 'F208')?.confidence).toBe(0.8);
  });

  it('deep-merges environment overrides', () => {
    const out = mergeEnvironmentOverridesV1(
      {
        weather: { wind_mps: 5 },
        solar: { twilightBufferMin: 30 },
        source: 'old',
      },
      {
        weather: { visibility_m: 800 },
        solar: { twilightBufferMin: 45 },
      },
      'merge',
    );
    expect((out.weather as any).wind_mps).toBe(5);
    expect((out.weather as any).visibility_m).toBe(800);
    expect((out.solar as any).twilightBufferMin).toBe(45);
    expect(out.source).toBe('RouteDirection_Admin_Metadata');
  });

  it('previews weather risk with default policy', () => {
    const r = previewEnvironmentRisk({
      eventTimeISO: '2026-06-01T18:00:00.000Z',
      weather: {
        forecastSeries: [
          {
            start: '2026-06-01T12:00:00.000Z',
            end: '2026-06-02T00:00:00.000Z',
            wind_mps: 20,
            visibility_m: 600,
            precipitation_mm: 12,
            snow_depth_cm: 12,
          },
        ],
      },
      solar: { twilightBufferMin: 30 },
    });
    expect(r.policy.wind_drive_limit_kph).toBe(50);
    expect(r.weatherRisk).toBeGreaterThan(0);
  });
});
