import { PrefetcherService } from './prefetcher.service';
import { EvidenceCacheService } from './evidence-cache.service';
import { deriveFactsFromMetadata } from '../../../trips/decision/shared/fact-derivation.util';

describe('Warm Start v0 (weather) — prefetch writes evidence; world consumes without extra IO', () => {
  it('prefetched weather_physics produces drive_safety_v1 violated fact (cached_at + is_warm_hit preserved)', async () => {
    const cache = new EvidenceCacheService(undefined as any);
    const weatherSkill = { execute: jest.fn().mockResolvedValue({ weather: { current: { windSpeedMps: 25 } } }) };
    const prefetcher = new PrefetcherService(cache, weatherSkill as any);

    const rec = await prefetcher.prefetchWeatherWind({
      lat: 64.0,
      lng: -19.0,
      threshold_mps: 18,
      vehicle_type: 'CAMPERVAN',
      emergency_constraints: { forbidden_modes: [] },
    });
    expect(weatherSkill.execute).toHaveBeenCalledTimes(1);
    expect(rec.evidence.is_warm_hit).toBe(true);
    expect(rec.evidence.cached_at).toBeDefined();

    // simulate world injection → assembler derivation: treat as metadata.details.evidence
    const derived = deriveFactsFromMetadata({
      metadata: { rule_id: 'drive_safety_v1', details: { evidence: rec.evidence } } as any,
      reasonCodes: [],
      timestampIso: new Date().toISOString(),
    });
    const drive = derived.find((f) => String(f.rule_id) === 'drive_safety_v1');
    expect(drive).toBeDefined();
    expect(drive?.is_violated).toBe(true);
  });
});

