import { EvidenceCacheService } from './evidence-cache.service';
import { PrefetcherService } from './prefetcher.service';
import { deriveFactsFromMetadata } from '../../../trips/decision/shared/fact-derivation.util';

describe('Warm Start v0 (PT) — transfer window prefetch', () => {
  it('prefetched public_transit with planned<required derives public_transport_v1 violated fact', async () => {
    const cache = new EvidenceCacheService(undefined as any);
    const prefetcher = new PrefetcherService(cache, undefined as any);

    const rec = await prefetcher.prefetchPublicTransport({
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      serviceStatus: 'ACTIVE',
      transferWindowMin: 12,
      plannedTransferWindowMin: 5,
      emergency_constraints: { forbidden_modes: [], pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
    });

    const derived = deriveFactsFromMetadata({
      metadata: { rule_id: 'public_transport_v1', details: { evidence: rec.evidence } } as any,
      reasonCodes: [],
      timestampIso: new Date().toISOString(),
    });

    const pt = derived.find((f) => String(f.rule_id) === 'public_transport_v1');
    expect(pt).toBeDefined();
    expect(pt?.is_violated).toBe(true);
  });
});

