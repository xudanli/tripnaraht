/**
 * 冰岛气象局 IMO API — CAP / Meteoalarm 活跃预警（结构化 JSON，非网页抓取）
 *
 * 文档入口: https://api.vedur.is/ （OpenAPI 中 Meteoalarm、CAP broker）
 * 策略:
 * - 全国：`/v1/meteoalarm/active`、`/v1/capbroker/active/detailed/all`（短 TTL 缓存）
 * - 近邻：OpenAPI 地理查询 `.../lat/{lat}/long/{lng}/srid/4326/distance/{m}`（按坐标缓存，优先于全国灌入各点）
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface VedurCapNearOptions {
  /** 搜索半径（米），默认 75_000 或环境变量 VEDUR_CAP_NEAR_RADIUS_METERS */
  radiusM?: number;
}

export interface VedurCapAlertItem {
  identifier: string;
  headline: string;
  severity?: string;
  urgency?: string;
  effective?: string;
}

export interface VedurCapAlertsPack {
  ok: boolean;
  items: VedurCapAlertItem[];
  fetchedAt: Date;
  sourcePath: string;
  error?: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function defaultNearRadiusM(): number {
  const raw = process.env.VEDUR_CAP_NEAR_RADIUS_METERS;
  const n = raw != null && raw !== '' ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 1000 ? Math.round(n) : 75_000;
}

@Injectable()
export class VedurCapAlertsService {
  private readonly logger = new Logger(VedurCapAlertsService.name);
  private readonly http: AxiosInstance;
  private nationalCache: { expires: number; pack: VedurCapAlertsPack } | null = null;
  /** 按约 0.02° 网格缓存近邻 CAP，减少多 waypoint 重复请求 */
  private readonly nearCache = new Map<string, { expires: number; pack: VedurCapAlertsPack }>();

  constructor() {
    const baseURL = (process.env.VEDUR_API_BASE_URL || 'https://api.vedur.is').replace(/\/$/, '');
    this.http = axios.create({
      baseURL,
      timeout: 12_000,
      headers: { Accept: 'application/json' },
      validateStatus: () => true,
    });
    this.logger.log(`VedurCapAlertsService baseURL=${baseURL}`);
  }

  /**
   * 拉取当前全国/区域活跃预警列表（与具体坐标弱绑定；供 Gate 与 WeatherAlertSkill 合并）。
   */
  async fetchActiveCapAlerts(): Promise<VedurCapAlertsPack> {
    const now = Date.now();
    if (this.nationalCache && this.nationalCache.expires > now) {
      return this.nationalCache.pack;
    }

    const candidates = ['/v1/meteoalarm/active', '/v1/capbroker/active/detailed/all'];

    for (const path of candidates) {
      try {
        const res = await this.http.get(path);
        if (res.status !== 200 || res.data == null) {
          this.logger.debug(`Vedur CAP ${path} -> HTTP ${res.status}`);
          continue;
        }
        const items = this.extractAlertItems(res.data);
        if (items.length > 0) {
          const pack: VedurCapAlertsPack = {
            ok: true,
            items: this.dedupeItems(items).slice(0, 20),
            fetchedAt: new Date(),
            sourcePath: path,
          };
          this.nationalCache = { expires: now + CACHE_TTL_MS, pack };
          this.logger.log(`Vedur CAP ${path}: ${pack.items.length} alert(s)`);
          return pack;
        }
      } catch (e: any) {
        this.logger.warn(`Vedur CAP ${path} failed: ${e?.message ?? e}`);
      }
    }

    const empty: VedurCapAlertsPack = {
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: candidates.join(','),
      error: 'No active CAP/Meteoalarm payload or HTTP error',
    };
    this.nationalCache = { expires: now + Math.min(60_000, CACHE_TTL_MS), pack: empty };
    return empty;
  }

  /**
   * 按经纬度查询附近活跃 CAP（IMO OpenAPI 地理端点）；失败或空时由调用方回退到 {@link fetchActiveCapAlerts}。
   */
  async fetchCapAlertsNear(lat: number, lng: number, options?: VedurCapNearOptions): Promise<VedurCapAlertsPack> {
    const radiusM = options?.radiusM ?? defaultNearRadiusM();
    const gridLat = Math.round(lat * 50) / 50;
    const gridLng = Math.round(lng * 50) / 50;
    const cacheKey = `${gridLat.toFixed(4)}_${gridLng.toFixed(4)}_${radiusM}`;
    const now = Date.now();
    const hit = this.nearCache.get(cacheKey);
    if (hit && hit.expires > now) {
      return hit.pack;
    }

    const latS = String(lat);
    const lngS = String(lng);
    const paths = [
      `/v1/lat/${latS}/long/${lngS}/srid/4326/distance/${radiusM}`,
      `/lat/${latS}/long/${lngS}/srid/4326/distance/${radiusM}`,
    ];

    for (const path of paths) {
      try {
        const res = await this.http.get(path);
        if (res.status !== 200 || res.data == null) {
          this.logger.debug(`Vedur CAP near ${path} -> HTTP ${res.status}`);
          continue;
        }
        const items = this.extractAlertItems(res.data);
        if (items.length > 0) {
          const pack: VedurCapAlertsPack = {
            ok: true,
            items: this.dedupeItems(items).slice(0, 20),
            fetchedAt: new Date(),
            sourcePath: path,
          };
          this.nearCache.set(cacheKey, { expires: now + CACHE_TTL_MS, pack });
          this.logger.log(`Vedur CAP near ${path}: ${pack.items.length} alert(s)`);
          return pack;
        }
      } catch (e: any) {
        this.logger.debug(`Vedur CAP near ${path}: ${e?.message ?? e}`);
      }
    }

    const empty: VedurCapAlertsPack = {
      ok: false,
      items: [],
      fetchedAt: new Date(),
      sourcePath: paths.join(','),
      error: 'No near CAP payload or endpoint unavailable',
    };
    this.nearCache.set(cacheKey, { expires: now + Math.min(60_000, CACHE_TTL_MS), pack: empty });
    return empty;
  }

  private dedupeItems(items: VedurCapAlertItem[]): VedurCapAlertItem[] {
    const seen = new Set<string>();
    const out: VedurCapAlertItem[] = [];
    for (const it of items) {
      const k = `${it.identifier}|${it.headline}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  }

  /**
   * 容错解析：支持数组根、CAP 单文档、含 info[]、GeoJSON features 等常见嵌套。
   */
  extractAlertItems(data: unknown): VedurCapAlertItem[] {
    const out: VedurCapAlertItem[] = [];
    this.walkCapLike(data, out, 0);
    return out;
  }

  private walkCapLike(node: unknown, out: VedurCapAlertItem[], depth: number): void {
    if (depth > 12 || node == null) return;

    if (Array.isArray(node)) {
      for (const el of node) {
        this.walkCapLike(el, out, depth + 1);
      }
      return;
    }

    if (typeof node !== 'object') return;
    const o = node as Record<string, unknown>;

    if (typeof o.headline === 'string' && o.headline.trim().length > 0) {
      out.push({
        identifier: String(o.identifier ?? o.id ?? `anon-${out.length}`),
        headline: o.headline.trim().slice(0, 800),
        severity: typeof o.severity === 'string' ? o.severity : undefined,
        urgency: typeof o.urgency === 'string' ? o.urgency : undefined,
        effective: typeof o.effective === 'string' ? o.effective : undefined,
      });
    }

    if (Array.isArray(o.info)) {
      for (const inf of o.info) {
        if (inf && typeof inf === 'object') {
          const i = inf as Record<string, unknown>;
          const headline =
            typeof i.headline === 'string'
              ? i.headline
              : typeof i.event === 'string'
                ? i.event
                : typeof i.description === 'string'
                  ? String(i.description).slice(0, 400)
                  : '';
          if (headline.trim()) {
            out.push({
              identifier: String(o.identifier ?? i.event ?? `info-${out.length}`),
              headline: headline.trim().slice(0, 800),
              severity: typeof i.severity === 'string' ? i.severity : undefined,
              urgency: typeof i.urgency === 'string' ? i.urgency : undefined,
              effective: typeof i.effective === 'string' ? i.effective : undefined,
            });
          }
        }
      }
    }

    for (const v of Object.values(o)) {
      if (v && typeof v === 'object') {
        this.walkCapLike(v, out, depth + 1);
      }
    }
  }
}
