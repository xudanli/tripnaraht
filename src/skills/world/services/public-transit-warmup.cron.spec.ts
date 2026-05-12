import { PublicTransitWarmupCron } from './public-transit-warmup.cron';

describe('PublicTransitWarmupCron', () => {
  it('prefetches all hotspot pairs via adapter using allSettled', async () => {
    const hotspots = {
      listActivePairs: jest.fn().mockReturnValue([
        { provider: 'stub_gtfs', station_a: 'A', station_b: 'B' },
        { provider: 'stub_gtfs', station_a: 'C', station_b: 'D' },
      ]),
      decideBucketMinutes: jest.fn().mockReturnValue(5),
      markPolled: jest.fn(),
    };
    const prefetcher = {
      prefetchPublicTransportFromAdapter: jest.fn().mockResolvedValue({ ok: true }),
    };
    const cron = new PublicTransitWarmupCron(hotspots as any, prefetcher as any);
    await cron.handleTick();
    expect(prefetcher.prefetchPublicTransportFromAdapter).toHaveBeenCalledTimes(2);
  });
});

