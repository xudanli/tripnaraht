import { EvidenceCacheService } from './evidence-cache.service';
import { PrefetcherService } from './prefetcher.service';
import { PublicTransitRealtimeAdapterRegistry } from './public-transit-realtime-adapter.registry';
import { StubGtfsRealtimeAdapter } from './stub-gtfs-realtime.adapter';
import { PublicTransitWarmupCron } from './public-transit-warmup.cron';

describe('GTFS warmup v2 (e2e-ish): adapter -> cron -> cache', () => {
  it('writes a GTFS_REALTIME evidence record into 5min bucket', async () => {
    const cache = new EvidenceCacheService(undefined as any);
    const reg = new PublicTransitRealtimeAdapterRegistry();
    reg.register(new StubGtfsRealtimeAdapter('CONNECTION_GAP'));
    const prefetcher = new PrefetcherService(cache, undefined as any, reg as any);
    const hotspots = {
      listActivePairs: () => [{ provider: 'stub_gtfs', station_a: 'STATION_A', station_b: 'HOTEL_B' }],
      decideBucketMinutes: () => 5,
      markPolled: () => undefined,
    };
    const cron = new PublicTransitWarmupCron(hotspots as any, prefetcher as any);

    await cron.handleTick();

    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });
    const geo_hash = cache.transitPairHash('STATION_A', 'HOTEL_B');
    const time_bucket = cache.timeBucketIso(Date.now(), 5);
    const rec = await cache.get({ rule_id: 'public_transport_v1', geo_hash, time_bucket, constraints_hash });
    expect(rec).toBeTruthy();
    expect(String((rec as any).evidence?.source ?? '')).toContain('GTFS_REALTIME:stub_gtfs');
  });
});

