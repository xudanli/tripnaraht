import { EvidenceCacheService } from './evidence-cache.service';
import { PrefetcherService } from './prefetcher.service';
import { PublicTransitRealtimeAdapterRegistry } from './public-transit-realtime-adapter.registry';
import { StubGtfsRealtimeAdapter } from './stub-gtfs-realtime.adapter';

describe('Heal path prefetching (v2)', () => {
  it('when PT snapshot is violated, prefetcher also warms drive_safety_v1 weather evidence', async () => {
    const cache = new EvidenceCacheService(undefined as any);
    const reg = new PublicTransitRealtimeAdapterRegistry();
    reg.register(new StubGtfsRealtimeAdapter('CONNECTION_GAP'));
    const prefetcher = new PrefetcherService(cache, undefined as any, reg as any, undefined as any);

    await prefetcher.prefetchPublicTransportFromAdapter({
      provider: 'stub_gtfs',
      station_a: 'STATION_A',
      station_b: 'HOTEL_B',
      emergency_constraints: { pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } },
      heal_prefetch_weather: { lat: 64.0, lng: -19.0, wind_speed_mps: 25, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
    });

    const constraints_hash = cache.hashEmergencyConstraints({ pt_station_pair: { station_a: 'STATION_A', station_b: 'HOTEL_B' } });
    const geo_hash = cache.geoHash(64.0, -19.0, 2);
    const time_bucket = cache.timeBucketIso(Date.now(), 60);
    const rec = await cache.get({ rule_id: 'drive_safety_v1', geo_hash, time_bucket, constraints_hash });
    expect(rec).toBeTruthy();
    expect((rec as any).evidence?.type).toBe('weather_physics');
    expect((rec as any).evidence?.wind_speed_mps).toBe(25);
  });
});

