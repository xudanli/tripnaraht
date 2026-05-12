import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

const REDIS_PREFIX = 'tripnara:research_prior:v1:';
const REDIS_TTL_SEC = 15 * 60;
const MEM_MAX = 2000;
const DEFAULT_MAX_JSON = 280_000;

type SnapshotEnvelope = {
  research_data: Record<string, unknown>;
  saved_at: string;
  fingerprint: string;
};

type MemEntry = { expiresAt: number; envelope: SnapshotEnvelope };

/**
 * 无状态客户端未回传 `research_data` 时，用 conversation_id / trip+user 键恢复上一轮 RESEARCH，
 * 以便 `transport_only` 增量自愈仍能合并 POI 等 prior 字段。
 * Redis（若注入）+ 进程内 LRU 兜底；大对象会裁剪 `poi_evidence`。
 */
@Injectable()
export class ResearchPriorSnapshotService {
  private readonly logger = new Logger(ResearchPriorSnapshotService.name);
  private readonly mem = new Map<string, MemEntry>();

  constructor(@Optional() private readonly redis?: RedisService) {}

  /** 稳定会话键：优先 meta.conversation_id，否则 trip_id + user_id */
  conversationKey(request: RouteAndRunRequestDto): string | undefined {
    const cid = String((request.meta as { conversation_id?: string } | undefined)?.conversation_id ?? '').trim();
    if (cid) return `conv:${cid}`;
    const tid = request.trip_id != null ? String(request.trip_id).trim() : '';
    const uid = String(request.user_id ?? '').trim();
    if (tid && uid) return `trip:${tid}:u:${uid}`;
    return undefined;
  }

  private redisKey(ck: string): string {
    return `${REDIS_PREFIX}${ck}`;
  }

  private fingerprint(rd: Record<string, unknown>): string {
    const te = rd.transport_evidence as Record<string, unknown> | undefined;
    const pois = rd.poi_evidence;
    const poiN = Array.isArray(pois) ? pois.length : 0;
    const raw = `${Object.keys(rd).sort().join(',')}|poi=${poiN}|te=${(te as any)?.evidence_id ?? te?.missing ?? ''}`;
    let h = 5381;
    for (let i = 0; i < raw.length; i++) h = (h * 33) ^ raw.charCodeAt(i);
    return `djb2:${(h >>> 0).toString(16)}`;
  }

  trimForStorage(rd: Record<string, unknown>, maxJsonChars = DEFAULT_MAX_JSON): Record<string, unknown> {
    const out = { ...rd };
    const pois = out.poi_evidence;
    if (Array.isArray(pois) && pois.length > 100) {
      out.poi_evidence = pois.slice(0, 100);
      (out as Record<string, unknown>)._prior_snapshot_truncated = true;
    }
    try {
      let s = JSON.stringify(out);
      if (s.length <= maxJsonChars) return out;
      const minimal: Record<string, unknown> = {
        transport_endpoint_hydration: out.transport_endpoint_hydration,
        poi_evidence: Array.isArray(pois) ? pois.slice(0, 50) : out.poi_evidence,
        opening_hours_evidence: out.opening_hours_evidence,
        dem_metrics: out.dem_metrics,
        risk_assessment: out.risk_assessment,
        windSpeedMs: out.windSpeedMs,
        windSpeedMs_meta: out.windSpeedMs_meta,
        failure_risk_prediction: out.failure_risk_prediction,
        weather_forecast: out.weather_forecast,
        _prior_snapshot_minimal: true,
      };
      s = JSON.stringify(minimal);
      if (s.length > maxJsonChars) {
        (minimal as any).poi_evidence = Array.isArray(pois) ? pois.slice(0, 24) : minimal.poi_evidence;
      }
      return minimal;
    } catch {
      return { poi_evidence: Array.isArray(pois) ? pois.slice(0, 30) : [], _prior_snapshot_minimal: true };
    }
  }

  private memPrune(): void {
    const now = Date.now();
    for (const [k, v] of this.mem) {
      if (v.expiresAt <= now) this.mem.delete(k);
    }
    if (this.mem.size <= MEM_MAX) return;
    const drop = this.mem.size - MEM_MAX;
    let i = 0;
    for (const k of this.mem.keys()) {
      this.mem.delete(k);
      if (++i >= drop) break;
    }
  }

  private memSet(key: string, envelope: SnapshotEnvelope): void {
    this.memPrune();
    this.mem.set(key, { expiresAt: Date.now() + REDIS_TTL_SEC * 1000, envelope });
  }

  private memGet(key: string): SnapshotEnvelope | undefined {
    const e = this.mem.get(key);
    if (!e || e.expiresAt <= Date.now()) {
      if (e) this.mem.delete(key);
      return undefined;
    }
    return e.envelope;
  }

  async save(request: RouteAndRunRequestDto, researchData: Record<string, unknown>): Promise<void> {
    const ck = this.conversationKey(request);
    if (!ck || !researchData || typeof researchData !== 'object') return;
    const trimmed = this.trimForStorage(researchData);
    const key = this.redisKey(ck);
    const envelope: SnapshotEnvelope = {
      research_data: trimmed,
      saved_at: new Date().toISOString(),
      fingerprint: this.fingerprint(trimmed),
    };
    try {
      if (this.redis) {
        await this.redis.set(key, envelope, REDIS_TTL_SEC);
      }
    } catch (err: any) {
      this.logger.warn(`[ResearchPriorSnapshot] Redis set failed: ${err?.message ?? err}`);
    }
    this.memSet(key, envelope);
  }

  async load(request: RouteAndRunRequestDto): Promise<Record<string, unknown> | undefined> {
    const ck = this.conversationKey(request);
    if (!ck) return undefined;
    const key = this.redisKey(ck);
    try {
      if (this.redis) {
        const fromRedis = await this.redis.get<SnapshotEnvelope>(key);
        const rd = fromRedis?.research_data;
        if (rd && typeof rd === 'object' && Object.keys(rd).length > 0) {
          this.memSet(key, fromRedis);
          return rd;
        }
      }
    } catch (err: any) {
      this.logger.warn(`[ResearchPriorSnapshot] Redis get failed: ${err?.message ?? err}`);
    }
    const mem = this.memGet(key);
    const rd = mem?.research_data;
    if (rd && typeof rd === 'object' && Object.keys(rd).length > 0) return rd;
    return undefined;
  }
}
