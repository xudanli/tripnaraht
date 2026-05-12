import { Injectable } from '@nestjs/common';

export type TransitHotspotPair = {
  provider: string;
  station_a: string;
  station_b: string;
  weight?: number;
  last_polled_at?: string;
  last_bucket_minutes?: number;
  heal_prefetch_weather?: { lat: number; lng: number; wind_speed_mps?: number; threshold_mps?: number; vehicle_type?: string };
  recent?: Array<{
    at: string;
    serviceStatus: string;
    transferWindowMin: number;
    plannedTransferWindowMin: number;
  }>;
};

@Injectable()
export class HotspotRegistryService {
  /**
   * v0: in-memory list. Later: DB-backed + traffic-weighted.
   */
  private readonly pairs = new Map<string, TransitHotspotPair>();

  private key(provider: string, a: string, b: string): string {
    return `${String(provider)}::${String(a)}::${String(b)}`;
  }

  observeRequest(params: { provider: string; station_a: string; station_b: string; weight?: number }): void {
    const k = this.key(params.provider, params.station_a, params.station_b);
    const cur = this.pairs.get(k) ?? {
      provider: params.provider,
      station_a: params.station_a,
      station_b: params.station_b,
      weight: 0,
      recent: [],
    };
    cur.weight = (cur.weight ?? 0) + (params.weight ?? 1);
    this.pairs.set(k, cur);
  }

  recordSnapshot(params: {
    provider: string;
    station_a: string;
    station_b: string;
    snapshot: { serviceStatus: string; transferWindowMin: number; plannedTransferWindowMin: number };
  }): void {
    const k = this.key(params.provider, params.station_a, params.station_b);
    const cur = this.pairs.get(k) ?? {
      provider: params.provider,
      station_a: params.station_a,
      station_b: params.station_b,
      weight: 0,
      recent: [],
    };
    const now = new Date().toISOString();
    const next = [...(cur.recent ?? []), { at: now, ...params.snapshot }].slice(-6);
    cur.recent = next;
    this.pairs.set(k, cur);
  }

  decideBucketMinutes(pair: TransitHotspotPair): number {
    const recent = pair.recent ?? [];
    if (recent.length < 2) return 5;
    const last = recent[recent.length - 1]!;
    const prev = recent[recent.length - 2]!;
    const statusChanged = String(last.serviceStatus) !== String(prev.serviceStatus);
    const reqDelta = Math.abs(Number(last.transferWindowMin) - Number(prev.transferWindowMin));
    const plannedDelta = Math.abs(Number(last.plannedTransferWindowMin) - Number(prev.plannedTransferWindowMin));
    const highEntropy = statusChanged || reqDelta >= 4 || plannedDelta >= 4;
    return highEntropy ? 1 : 5;
  }

  /**
   * Returns a prioritized list of pairs to poll (highest score first).
   * score = weight / (1 + minutes_since_last_polled)
   */
  listActivePairs(limit = 20): TransitHotspotPair[] {
    const now = Date.now();
    const all = Array.from(this.pairs.values());
    if (all.length === 0) {
      // seed default pair for dev
      return [
        {
          provider: 'stub_gtfs',
          station_a: 'STATION_A',
          station_b: 'HOTEL_B',
          weight: 1,
          // v2 demo: enable heal-path warmup with deterministic wind
          heal_prefetch_weather: { lat: 64.0, lng: -19.0, wind_speed_mps: 25, threshold_mps: 18, vehicle_type: 'CAMPERVAN' },
          recent: [],
        },
      ];
    }
    return all
      .map((p) => {
        const t = p.last_polled_at ? Date.parse(String(p.last_polled_at)) : NaN;
        const mins = Number.isFinite(t) ? Math.max(0, (now - t) / 60000) : 999;
        const w = typeof p.weight === 'number' && Number.isFinite(p.weight) ? p.weight : 0;
        const score = w / (1 + mins);
        return { ...p, score };
      })
      .sort((a: any, b: any) => Number(b.score) - Number(a.score))
      .slice(0, Math.max(1, Math.floor(limit)))
      .map(({ score: _score, ...rest }: any) => rest);
  }

  markPolled(pair: TransitHotspotPair, bucketMinutes: number): void {
    const k = this.key(pair.provider, pair.station_a, pair.station_b);
    const cur = this.pairs.get(k) ?? pair;
    cur.last_polled_at = new Date().toISOString();
    cur.last_bucket_minutes = bucketMinutes;
    this.pairs.set(k, cur);
  }
}

