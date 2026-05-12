import { Injectable, Optional } from '@nestjs/common';
import { EvidenceCacheService, type CachedEvidenceRecord } from './evidence-cache.service';
import { WeatherSearchSkill } from '../../weather/weather-search.skill';
import { PublicTransitRealtimeAdapterRegistry } from './public-transit-realtime-adapter.registry';
import { HotspotRegistryService } from './hotspot-registry.service';
import { AccessTrackerService } from './access-tracker.service';
import { DrivePricingQuoteSkill } from './drive-pricing-quote.skill';

@Injectable()
export class PrefetcherService {
  constructor(
    private readonly cache: EvidenceCacheService,
    @Optional() private readonly weatherSearchSkill?: WeatherSearchSkill,
    @Optional() private readonly ptAdapters?: PublicTransitRealtimeAdapterRegistry,
    @Optional() private readonly hotspots?: HotspotRegistryService,
    @Optional() private readonly accessTracker?: AccessTrackerService,
    @Optional() private readonly drivePricingQuoteSkill?: DrivePricingQuoteSkill,
  ) {}

  /**
   * Minimal v0: prefetch weather wind evidence for the next hour bucket.
   * Writes a weather_physics evidence object into cache.
   */
  async prefetchWeatherWind(params: {
    lat: number;
    lng: number;
    wind_speed_mps?: number;
    threshold_mps: number;
    vehicle_type?: string;
    emergency_constraints?: any;
    ttl_seconds?: number;
  }): Promise<CachedEvidenceRecord> {
    const now = Date.now();
    const cached_at = new Date(now).toISOString();
    const expires_at = new Date(now + 55 * 60 * 1000).toISOString(); // ~1h
    const constraints_hash = this.cache.hashEmergencyConstraints(params.emergency_constraints ?? null);
    const geo_hash = this.cache.geoHash(params.lat, params.lng, 2);
    const time_bucket = this.cache.timeBucketIso(now, 60);

    // v0: allow deterministic test injection via wind_speed_mps; otherwise try skill.
    let wind = params.wind_speed_mps;
    if (wind == null && this.weatherSearchSkill) {
      this.accessTracker?.inc('external.weather');
      const r: any = await this.weatherSearchSkill.execute({ lat: params.lat, lng: params.lng });
      wind =
        (r?.weather?.current?.windSpeedMps as any) ??
        (r?.weather?.windSpeedMps as any) ??
        (r?.weather?.wind_speed_mps as any) ??
        null;
    }
    const wind_speed_mps = typeof wind === 'number' && Number.isFinite(wind) ? wind : 0;

    const evidence = {
      type: 'weather_physics',
      rule_id: 'drive_safety_v1',
      source: params.wind_speed_mps != null ? 'PREFETCH_TEST_OVERRIDE' : 'PREFETCH_WEATHER_SKILL',
      wind_speed_mps,
      threshold_mps: params.threshold_mps,
      vehicle_type: params.vehicle_type ?? 'UNKNOWN',
      cached_at,
      expires_at,
      is_warm_hit: true,
    };

    const rec: CachedEvidenceRecord = {
      rule_id: 'drive_safety_v1',
      geo_hash,
      time_bucket,
      constraints_hash,
      cached_at,
      expires_at,
      evidence,
    };
    await this.cache.set(rec, params.ttl_seconds ?? 3600);
    return rec;
  }

  /**
   * Prefetch a pricing quote for a potential DRIVE fallback (used by negotiation).
   * Writes a pricing_quote evidence object into cache (bucketed at 60 minutes).
   */
  async prefetchDriveQuote(params: {
    lat: number;
    lng: number;
    quote_usd?: number;
    emergency_constraints?: any;
    ttl_seconds?: number;
  }): Promise<CachedEvidenceRecord> {
    const now = Date.now();
    const cached_at = new Date(now).toISOString();
    const expires_at = new Date(now + 55 * 60 * 1000).toISOString(); // ~1h
    const constraints_hash = this.cache.hashEmergencyConstraints(params.emergency_constraints ?? null);
    const geo_hash = this.cache.geoHash(params.lat, params.lng, 2);
    const time_bucket = this.cache.timeBucketIso(now, 60);

    let quote = params.quote_usd;
    let source = params.quote_usd != null ? 'PREFETCH_TEST_OVERRIDE' : 'PREFETCH_PRICING_SKILL';
    if (quote == null && this.drivePricingQuoteSkill) {
      this.accessTracker?.inc('external.pricing');
      const r = await this.drivePricingQuoteSkill.execute({ lat: params.lat, lng: params.lng });
      quote = Number((r as any)?.quote_usd ?? 50);
      source = String((r as any)?.source ?? source);
      this.accessTracker?.setValue('external.pricing.last_quote_usd', quote);
    }
    const quote_usd = typeof quote === 'number' && Number.isFinite(quote) ? quote : 50;

    const evidence = {
      type: 'pricing_quote',
      rule_id: 'drive_quote_v1',
      source,
      quote_usd,
      currency: 'USD',
      cached_at,
      expires_at,
      is_warm_hit: true,
    };

    const rec: CachedEvidenceRecord = {
      rule_id: 'drive_quote_v1',
      geo_hash,
      time_bucket,
      constraints_hash,
      cached_at,
      expires_at,
      evidence,
    };
    await this.cache.set(rec, params.ttl_seconds ?? 3600);
    return rec;
  }

  /**
   * Prefetch travel time evidence for a pair of coordinates.
   * Cache-first consumer: TradeoffEngine (travel-aware slack).
   */
  async prefetchTravelTime(params: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    mode: 'DRIVE' | 'WALK' | 'TRANSIT' | string;
    travel_minutes?: number;
    emergency_constraints?: any;
    ttl_seconds?: number;
  }): Promise<CachedEvidenceRecord> {
    const now = Date.now();
    const cached_at = new Date(now).toISOString();
    const expires_at = new Date(now + 55 * 60 * 1000).toISOString(); // ~1h
    const constraints_hash = this.cache.hashEmergencyConstraints(params.emergency_constraints ?? null);
    const geo_hash = this.cache.geoPairHash(params.from, params.to, params.mode ?? 'UNKNOWN', 2);
    const time_bucket = this.cache.timeBucketIso(now, 60);

    const travel_minutes =
      typeof params.travel_minutes === 'number' && Number.isFinite(params.travel_minutes) ? Math.max(0, params.travel_minutes) : 0;

    const evidence = {
      type: 'travel_time',
      rule_id: 'travel_time_v1',
      source: params.travel_minutes != null ? 'PREFETCH_TEST_OVERRIDE' : 'PREFETCH_ROUTE_CACHE',
      mode: String(params.mode ?? 'UNKNOWN').toUpperCase(),
      from: { lat: Number(params.from.lat), lng: Number(params.from.lng) },
      to: { lat: Number(params.to.lat), lng: Number(params.to.lng) },
      travel_minutes,
      cached_at,
      expires_at,
      is_warm_hit: true,
    };

    const rec: CachedEvidenceRecord = {
      rule_id: 'travel_time_v1',
      geo_hash,
      time_bucket,
      constraints_hash,
      cached_at,
      expires_at,
      evidence,
    };
    await this.cache.set(rec, params.ttl_seconds ?? 3600);
    return rec;
  }

  /**
   * Minimal v0: prefetch public transport transfer window snapshot.
   * Writes a public_transit evidence object into cache (bucketed at 5 minutes).
   */
  async prefetchPublicTransport(params: {
    lat?: number;
    lng?: number;
    station_a?: string;
    station_b?: string;
    serviceStatus: 'ACTIVE' | 'CANCELLED' | 'UNKNOWN';
    transferWindowMin: number;
    plannedTransferWindowMin: number;
    nextAvailableTripOffsetMin?: number;
    emergency_constraints?: any;
    ttl_seconds?: number;
    bucket_minutes?: number;
  }): Promise<CachedEvidenceRecord> {
    const now = Date.now();
    const cached_at = new Date(now).toISOString();
    const bucketMinutes = typeof params.bucket_minutes === 'number' && Number.isFinite(params.bucket_minutes) ? params.bucket_minutes : 5;
    const expires_at = new Date(now + Math.max(2, bucketMinutes * 2) * 60 * 1000).toISOString();
    const constraints_hash = this.cache.hashEmergencyConstraints(params.emergency_constraints ?? null);
    const geo_hash =
      params.station_a && params.station_b
        ? this.cache.transitPairHash(params.station_a, params.station_b)
        : this.cache.geoHash(Number(params.lat ?? 0), Number(params.lng ?? 0), 2);
    const time_bucket = this.cache.timeBucketIso(now, bucketMinutes);

    const evidence = {
      type: 'public_transit',
      rule_id: 'public_transport_v1',
      source: 'PREFETCH_PT_ADAPTER_V0',
      station_a: params.station_a ?? null,
      station_b: params.station_b ?? null,
      serviceStatus: params.serviceStatus,
      transferWindowMin: params.transferWindowMin,
      plannedTransferWindowMin: params.plannedTransferWindowMin,
      ...(typeof params.nextAvailableTripOffsetMin === 'number' && Number.isFinite(params.nextAvailableTripOffsetMin)
        ? { nextAvailableTripOffsetMin: params.nextAvailableTripOffsetMin }
        : {}),
      cached_at,
      expires_at,
      is_warm_hit: true,
      bucket_minutes: bucketMinutes,
    };

    const rec: CachedEvidenceRecord = {
      rule_id: 'public_transport_v1',
      geo_hash,
      time_bucket,
      constraints_hash,
      cached_at,
      expires_at,
      evidence,
    };
    await this.cache.set(rec, params.ttl_seconds ?? 600);
    return rec;
  }

  /**
   * v2: fetch PT snapshot from realtime adapter and write 5min bucket.
   */
  async prefetchPublicTransportFromAdapter(params: {
    provider: string;
    station_a: string;
    station_b: string;
    at_iso?: string;
    emergency_constraints?: any;
    bucket_minutes?: number;
    /**
     * Optional heal-path warmup: when PT snapshot is violated, prefetch DRIVE safety evidence too.
     * This enables 0-IO auto-heal on the second pass.
     */
    heal_prefetch_weather?: {
      lat: number;
      lng: number;
      wind_speed_mps?: number;
      threshold_mps?: number;
      vehicle_type?: string;
    };
  }): Promise<CachedEvidenceRecord> {
    const at_iso = params.at_iso ?? new Date().toISOString();
    const adapter = this.ptAdapters?.get(params.provider);
    if (!adapter) {
      throw new Error(`PT realtime adapter not found: ${String(params.provider)}`);
    }
    this.accessTracker?.inc('external.transit');
    const snap = await adapter.getTripSnapshot({ station_a: params.station_a, station_b: params.station_b, at_iso });
    const rec = await this.prefetchPublicTransport({
      station_a: params.station_a,
      station_b: params.station_b,
      serviceStatus: snap.serviceStatus,
      transferWindowMin: snap.transferWindowMin,
      plannedTransferWindowMin: snap.plannedTransferWindowMin,
      nextAvailableTripOffsetMin: (snap as any).nextAvailableTripOffsetMin,
      emergency_constraints: params.emergency_constraints,
      bucket_minutes: params.bucket_minutes,
      ttl_seconds: 600,
    });
    // override provenance to GTFS realtime source
    (rec.evidence as any).source = `GTFS_REALTIME:${String(params.provider)}`;
    (rec.evidence as any).provider_reference =
      snap.provider_reference ?? { provider: params.provider, reference_type: 'snapshot', reference_id: snap.snapshot_id ?? 'unknown' };
    (rec.evidence as any).snapshot_id = snap.snapshot_id ?? null;

    this.hotspots?.recordSnapshot({
      provider: params.provider,
      station_a: params.station_a,
      station_b: params.station_b,
      snapshot: {
        serviceStatus: snap.serviceStatus,
        transferWindowMin: snap.transferWindowMin,
        plannedTransferWindowMin: snap.plannedTransferWindowMin,
      },
    });

    // Heal-path prefetch: if PT is already violated (cancelled or transfer gap), prefetch DRIVE safety facts + a pricing quote.
    // This does not change strictness; it only moves evidence acquisition earlier.
    const isCancelled = String(snap.serviceStatus ?? '').toUpperCase() === 'CANCELLED' || String(snap.serviceStatus ?? '').toUpperCase() === 'CANCELED';
    const gapViolated = Number(snap.plannedTransferWindowMin) < Number(snap.transferWindowMin);
    const isViolated = isCancelled || gapViolated;
    if (isViolated && params.heal_prefetch_weather) {
      await this.prefetchWeatherWind({
        lat: params.heal_prefetch_weather.lat,
        lng: params.heal_prefetch_weather.lng,
        wind_speed_mps: params.heal_prefetch_weather.wind_speed_mps,
        threshold_mps:
          typeof params.heal_prefetch_weather.threshold_mps === 'number'
            ? params.heal_prefetch_weather.threshold_mps
            : 18,
        vehicle_type: params.heal_prefetch_weather.vehicle_type ?? 'CAMPERVAN',
        emergency_constraints: params.emergency_constraints,
        ttl_seconds: 3600,
      }).catch(() => undefined);

      await this.prefetchDriveQuote({
        lat: params.heal_prefetch_weather.lat,
        lng: params.heal_prefetch_weather.lng,
        emergency_constraints: params.emergency_constraints,
        ttl_seconds: 3600,
      }).catch(() => undefined);
    }

    return rec;
  }
}

