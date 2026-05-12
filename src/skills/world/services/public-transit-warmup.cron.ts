import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HotspotRegistryService } from './hotspot-registry.service';
import { PrefetcherService } from './prefetcher.service';

@Injectable()
export class PublicTransitWarmupCron {
  private readonly logger = new Logger(PublicTransitWarmupCron.name);

  constructor(
    private readonly hotspots: HotspotRegistryService,
    private readonly prefetcher: PrefetcherService,
  ) {}

  @Cron('*/1 * * * *', { name: 'pt-warmup-1min', timeZone: 'UTC' })
  async handleTick(): Promise<void> {
    const pairs = this.hotspots.listActivePairs(30);
    const t0 = Date.now();
    const results = await Promise.allSettled(
      pairs.map((p) =>
        this.prefetcher.prefetchPublicTransportFromAdapter({
          provider: p.provider,
          station_a: p.station_a,
          station_b: p.station_b,
          bucket_minutes: this.hotspots.decideBucketMinutes(p),
          emergency_constraints: { pt_station_pair: { station_a: p.station_a, station_b: p.station_b } },
          heal_prefetch_weather: (p as any)?.heal_prefetch_weather,
        }),
      ),
    );
    for (const p of pairs) {
      const bucketMinutes = this.hotspots.decideBucketMinutes(p);
      this.hotspots.markPolled(p, bucketMinutes);
    }
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const bad = results.length - ok;
    this.logger.log(`tick: pairs=${pairs.length}, ok=${ok}, failed=${bad}, ms=${Date.now() - t0}`);
  }
}

