import { Injectable, Optional } from '@nestjs/common';
import { CacheService } from '../../../common/cache/cache.service';
import { sha256Signature } from '../../../agent/contracts/decision-contract.types';

export type EvidenceCacheKeyParts = {
  rule_id: string;
  geo_hash: string;
  time_bucket: string;
  constraints_hash: string;
};

export type CachedEvidenceRecord = {
  rule_id: string;
  geo_hash: string;
  time_bucket: string;
  constraints_hash: string;
  cached_at: string;
  expires_at: string;
  evidence: Record<string, any>;
};

function safeIso(ms: number): string {
  return new Date(ms).toISOString();
}

@Injectable()
export class EvidenceCacheService {
  private readonly mem = new Map<string, CachedEvidenceRecord>();
  private readonly prefix = 'warm_evidence:';

  constructor(@Optional() private readonly cache?: CacheService) {}

  hashEmergencyConstraints(emergency_constraints: any): string {
    return sha256Signature({
      emergency_constraints: emergency_constraints && typeof emergency_constraints === 'object' ? emergency_constraints : null,
    });
  }

  geoHash(lat: number, lng: number, precision = 2): string {
    const p = Math.max(0, Math.min(6, Math.floor(precision)));
    const a = Number(lat);
    const b = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'geo:unknown';
    return `geo:${a.toFixed(p)}:${b.toFixed(p)}`;
  }

  transitPairHash(stationA: string, stationB: string): string {
    const a = String(stationA ?? '').trim() || 'UNKNOWN_A';
    const b = String(stationB ?? '').trim() || 'UNKNOWN_B';
    return `transit:${a}:${b}`;
  }

  geoPairHash(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    mode: string,
    precision = 2,
  ): string {
    const m = String(mode ?? 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
    const p = Math.max(0, Math.min(6, Math.floor(precision)));
    const aLat = Number(from?.lat);
    const aLng = Number(from?.lng);
    const bLat = Number(to?.lat);
    const bLng = Number(to?.lng);
    if (![aLat, aLng, bLat, bLng].every((x) => Number.isFinite(x))) return `pair:${m}:unknown`;
    return `pair:${m}:${aLat.toFixed(p)}:${aLng.toFixed(p)}->${bLat.toFixed(p)}:${bLng.toFixed(p)}`;
  }

  timeBucketIso(now = Date.now(), bucketMinutes = 60): string {
    const bm = Math.max(1, Math.floor(bucketMinutes));
    const ms = bm * 60 * 1000;
    const t = Math.floor(now / ms) * ms;
    return safeIso(t);
  }

  buildKey(p: EvidenceCacheKeyParts): string {
    return `${this.prefix}${p.rule_id}:${p.geo_hash}:${p.time_bucket}:${p.constraints_hash}`;
  }

  async get(p: EvidenceCacheKeyParts): Promise<CachedEvidenceRecord | null> {
    const key = this.buildKey(p);
    const now = Date.now();
    if (this.cache) {
      const v = await this.cache.get<CachedEvidenceRecord>(key);
      if (!v) return null;
      const exp = Date.parse(String(v.expires_at ?? ''));
      if (Number.isFinite(exp) && exp <= now) return null;
      if (String(v.constraints_hash) !== String(p.constraints_hash)) return null;
      return v;
    }
    const v = this.mem.get(key);
    if (!v) return null;
    const exp = Date.parse(String(v.expires_at ?? ''));
    if (Number.isFinite(exp) && exp <= now) return null;
    if (String(v.constraints_hash) !== String(p.constraints_hash)) return null;
    return v;
  }

  async set(rec: CachedEvidenceRecord, ttlSeconds?: number): Promise<void> {
    const key = this.buildKey(rec);
    if (this.cache) {
      await this.cache.set(key, rec, ttlSeconds ?? 3600);
      return;
    }
    this.mem.set(key, rec);
  }
}

