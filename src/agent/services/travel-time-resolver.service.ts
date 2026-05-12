import { Injectable, Optional } from '@nestjs/common';
import { EvidenceCacheService } from '../../skills/world/services/evidence-cache.service';
import { AccessTrackerService } from '../../skills/world/services/access-tracker.service';
import { TravelTimeRouterService } from './travel-time-router.service';
import {
  EvidenceInvalidationReason,
  EvidenceLineageSourceType,
  EvidenceReliability,
  TravelTimeEvidenceLineageDto,
} from '../dto/evidence-lineage.dto';

export type TravelTimeEdgeContext = {
  nowMs: number;
  constraints_hash: string | null | undefined;
  prefetchedEvidence: any[];
  memo: Map<string, { minutes: number; lineage: TravelTimeEvidenceLineageDto }>;
};

function findCachedTravelMinutesInList(prefetchedEvidence: any[], cur: any, next: any): number | undefined {
  const mode = 'DRIVE';
  const coords = (it: any) => {
    const c =
      it?.location_ref?.coordinates ??
      it?.location_ref?.coord ??
      it?.metadata?.coordinates ??
      it?.metadata?.coord ??
      null;
    const lat = Number(c?.lat);
    const lng = Number(c?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) };
  };
  const a = coords(cur);
  const b = coords(next);
  if (!a || !b) return undefined;

  for (const ev of Array.isArray(prefetchedEvidence) ? prefetchedEvidence : []) {
    if (!ev || typeof ev !== 'object') continue;
    const ruleId = String((ev as any)?.rule_id ?? '');
    const type = String((ev as any)?.type ?? '');
    if (ruleId !== 'travel_time_v1' && type !== 'travel_time') continue;
    const m = String((ev as any)?.mode ?? '').toUpperCase();
    if (m && m !== mode) continue;
    const from = (ev as any)?.from;
    const to = (ev as any)?.to;
    const f = { lat: Number(from?.lat), lng: Number(from?.lng) };
    const t = { lat: Number(to?.lat), lng: Number(to?.lng) };
    if (![f.lat, f.lng, t.lat, t.lng].every((x) => Number.isFinite(x))) continue;
    const f2 = { lat: Number(f.lat.toFixed(2)), lng: Number(f.lng.toFixed(2)) };
    const t2 = { lat: Number(t.lat.toFixed(2)), lng: Number(t.lng.toFixed(2)) };
    if (f2.lat === a.lat && f2.lng === a.lng && t2.lat === b.lat && t2.lng === b.lng) {
      const minutes = Number((ev as any)?.travel_minutes);
      if (Number.isFinite(minutes) && minutes >= 0) return minutes;
    }
  }
  return undefined;
}

function haversineMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }, speedKmh: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  const min = (km / speedKmh) * 60;
  if (!Number.isFinite(min)) return 0;
  return Math.max(0, Math.min(240, Math.round(min)));
}

function parsePeakHoursUtc(): Array<{ start: number; end: number }> {
  const raw = String(process.env.TRAVEL_TIME_PEAK_HOURS_UTC ?? '17-19').trim();
  const parts = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const ranges: Array<{ start: number; end: number }> = [];
  for (const p of parts) {
    const m = p.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!m) continue;
    const s = Number(m[1]);
    const e = Number(m[2]);
    if (![s, e].every((n) => Number.isFinite(n))) continue;
    ranges.push({ start: Math.max(0, Math.min(23, s)), end: Math.max(0, Math.min(23, e)) });
  }
  return ranges.length ? ranges : [{ start: 17, end: 19 }];
}

/** Exported for callers that need peak messaging without duplicating env parsing. */
export function isPeakHourUtc(ms: number): boolean {
  const h = new Date(ms).getUTCHours();
  for (const r of parsePeakHoursUtc()) {
    if (r.start <= r.end) {
      if (h >= r.start && h <= r.end) return true;
    } else if (h >= r.start || h <= r.end) {
      return true;
    }
  }
  return false;
}

function neighborHoursForMode(mode: string, nowMs: number): number {
  const m = String(mode ?? 'UNKNOWN').toUpperCase();
  if (m === 'WALK') return 4;
  if (m === 'DRIVE') {
    if (isPeakHourUtc(nowMs)) return 0;
    return 1;
  }
  return 1;
}

@Injectable()
export class TravelTimeResolverService {
  constructor(
    @Optional() private readonly evidenceCache?: EvidenceCacheService,
    @Optional() private readonly router?: TravelTimeRouterService,
    @Optional() private readonly accessTracker?: AccessTrackerService,
  ) {}

  /**
   * L1 (prefetched) -> L1b (time neighborhood) -> L2 (router + read-through) -> L3 (haversine lower bound)
   */
  async getMinTravelMinutes(cur: any, next: any, ctx: TravelTimeEdgeContext): Promise<{ minutes: number; lineage: TravelTimeEvidenceLineageDto } | undefined> {
    const coords = (it: any) => {
      const c =
        it?.location_ref?.coordinates ??
        it?.location_ref?.coord ??
        it?.metadata?.coordinates ??
        it?.metadata?.coord ??
        null;
      const lat = Number(c?.lat);
      const lng = Number(c?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    };
    const a = coords(cur);
    const b = coords(next);
    if (!a || !b) return undefined;

    const memoKey = this.evidenceCache
      ? this.evidenceCache.geoPairHash(a, b, 'DRIVE', 2)
      : `pair:DRIVE:${a.lat}:${a.lng}->${b.lat}:${b.lng}`;
    const memoHit = ctx.memo.get(memoKey);
    if (memoHit) return memoHit;

    const nowMs = ctx.nowMs;
    const peak = isPeakHourUtc(nowMs);
    const curTb = this.evidenceCache ? this.evidenceCache.timeBucketIso(nowMs, 60) : new Date(nowMs).toISOString();
    const mode = 'DRIVE';
    const nh = neighborHoursForMode(mode, nowMs);
    const constraints_hash = ctx.constraints_hash ?? null;

    const makeLineage = (input: {
      source_type: EvidenceLineageSourceType;
      matched_bucket?: string;
      ignored_bucket?: string;
      invalidation_reason?: EvidenceInvalidationReason;
    }): TravelTimeEvidenceLineageDto => {
      const reliability = peak ? EvidenceReliability.VOLATILE : EvidenceReliability.STABLE;
      const inv =
        reliability === EvidenceReliability.VOLATILE
          ? input.invalidation_reason ?? (peak ? EvidenceInvalidationReason.PEAK_VOLATILE_CONTEXT : undefined)
          : input.invalidation_reason;
      return {
        reliability,
        source_type: input.source_type,
        ...(inv ? { invalidation_reason: inv } : {}),
        captured_context: { is_peak: peak, mode, bucket: curTb },
        ...(input.matched_bucket ? { matched_bucket: input.matched_bucket } : {}),
        ...(input.ignored_bucket ? { ignored_bucket: input.ignored_bucket } : {}),
      } as TravelTimeEvidenceLineageDto;
    };

    // L1
    const cached = findCachedTravelMinutesInList(ctx.prefetchedEvidence, cur, next);
    if (typeof cached === 'number' && Number.isFinite(cached)) {
      const lineage = makeLineage({ source_type: EvidenceLineageSourceType.L1_CACHE_HIT });
      const out = { minutes: cached, lineage };
      ctx.memo.set(memoKey, out);
      return out;
    }

    let ignoredNeighborBucket: string | undefined;

    // L1b (+ peak neighbor distrust bookkeeping)
    if (this.evidenceCache && constraints_hash) {
      const geo_hash = this.evidenceCache.geoPairHash(a, b, 'DRIVE', 2);
      const bucketsToTry =
        nh <= 0
          ? [curTb]
          : Array.from(
              new Set([
                curTb,
                this.evidenceCache.timeBucketIso(nowMs - nh * 60 * 60_000, 60),
                this.evidenceCache.timeBucketIso(nowMs + nh * 60 * 60_000, 60),
              ]),
            );

      if (peak && nh === 0) {
        const neighborBuckets = Array.from(
          new Set([this.evidenceCache.timeBucketIso(nowMs - 60 * 60_000, 60), this.evidenceCache.timeBucketIso(nowMs + 60 * 60_000, 60)]),
        );
        for (const tb of neighborBuckets) {
          const rec = await this.evidenceCache.get({
            rule_id: 'travel_time_v1',
            geo_hash,
            time_bucket: tb,
            constraints_hash,
          });
          if (rec?.evidence) {
            ignoredNeighborBucket = tb;
            break;
          }
        }
      }

      for (const tb of bucketsToTry) {
        const rec = await this.evidenceCache.get({
          rule_id: 'travel_time_v1',
          geo_hash,
          time_bucket: tb,
          constraints_hash,
        });
        const minutes = Number((rec as any)?.evidence?.travel_minutes);
        if (Number.isFinite(minutes) && minutes >= 0) {
          ctx.prefetchedEvidence.push((rec as any).evidence);
          const exactBucket = tb === curTb;
          const lineage = makeLineage({
            source_type: exactBucket ? EvidenceLineageSourceType.L1_CACHE_HIT : EvidenceLineageSourceType.L1B_NEIGHBOR_HIT,
            ...(exactBucket ? {} : { matched_bucket: tb }),
          });
          const out = { minutes, lineage };
          ctx.memo.set(memoKey, out);
          return out;
        }
      }
    }

    // L2
    const time_bucket = this.evidenceCache?.timeBucketIso(nowMs, 60);
    if (this.router && this.evidenceCache && constraints_hash && time_bucket) {
      this.accessTracker?.inc('external.router');
      try {
        const minutes = await this.router.estimateTravelMinutes({ from: a, to: b, mode: 'DRIVE' });
        if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 0) {
          const geo_hash = this.evidenceCache.geoPairHash(a, b, 'DRIVE', 2);
          const cached_at = new Date().toISOString();
          const expires_at = new Date(Date.now() + 55 * 60 * 1000).toISOString();
          await this.evidenceCache.set(
            {
              rule_id: 'travel_time_v1',
              geo_hash,
              time_bucket,
              constraints_hash,
              cached_at,
              expires_at,
              evidence: {
                type: 'travel_time',
                rule_id: 'travel_time_v1',
                source: 'ROUTER_READ_THROUGH',
                mode: 'DRIVE',
                from: { lat: Number(a.lat), lng: Number(a.lng) },
                to: { lat: Number(b.lat), lng: Number(b.lng) },
                travel_minutes: minutes,
                cached_at,
                expires_at,
                is_warm_hit: true,
              },
            },
            3600,
          );
          ctx.prefetchedEvidence.push({
            type: 'travel_time',
            rule_id: 'travel_time_v1',
            mode: 'DRIVE',
            from: { lat: Number(a.lat), lng: Number(a.lng) },
            to: { lat: Number(b.lat), lng: Number(b.lng) },
            travel_minutes: minutes,
            cached_at,
            expires_at,
            is_warm_hit: true,
          });
          const lineage = makeLineage({
            source_type: EvidenceLineageSourceType.L2_REALTIME_COMPUTED,
            invalidation_reason:
              ignoredNeighborBucket && peak
                ? EvidenceInvalidationReason.EXPIRED_TRUST_NEIGHBORHOOD
                : peak
                  ? EvidenceInvalidationReason.PEAK_STRICT_REMEASURE
                  : undefined,
            ...(ignoredNeighborBucket && peak ? { ignored_bucket: ignoredNeighborBucket } : {}),
          });
          const out = { minutes, lineage };
          ctx.memo.set(memoKey, out);
          return out;
        }
      } catch {
        // fall through
      }
    }

    // L3
    const minutes = haversineMinutes(a, b, 30);
    const lineage = {
      reliability: EvidenceReliability.STABLE,
      source_type: EvidenceLineageSourceType.L3_FALLBACK,
      captured_context: { is_peak: peak, mode, bucket: curTb },
    } as TravelTimeEvidenceLineageDto;
    const out = { minutes, lineage };
    ctx.memo.set(memoKey, out);
    return out;
  }
}
