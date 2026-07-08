// src/skills/transport/transport-search.skill.ts
/**
 * transport.search Skill
 * 
 * 搜索两点之间的交通路线
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { TransportRoutingService } from '../../transport/transport-routing.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';
import { inferEntityResolutionCountryCode } from '../../canonical-poi-resolution/adapters/cpre-entity-resolution.bridge';
import { Skill as SkillDecorator } from '../decorators/skill.decorator';

let TRANSPORT_EVIDENCE_SEQ = 0;

/** 供编排层识别：非服务故障，仅为起终点无法解析为坐标，应降级而非拒绝整次请求 */
export const TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER = '[transport.search:unresolved_coords]';

function formatEndpointForError(v: string | { lat: number; lng: number }): string {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > 120 ? `${t.slice(0, 117)}...` : t || '(empty)';
  }
  return `${v.lat},${v.lng}`;
}

export interface TransportSearchInput extends SkillInput {
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  /** ISO 3166-1 alpha-2；冰岛场景经 CPRE 解析地名坐标 */
  countryCode?: string;
}

export interface TransportSearchOutput extends SkillOutput {
  evidence_id: string;
  origin: string | { lat: number; lng: number };
  destination: string | { lat: number; lng: number };
  options: Array<{
    mode: string;
    duration_minutes: number;
    distance_meters?: number;
    steps?: any[];
  }>;
  best_option?: {
    mode: string;
    duration_minutes: number;
    distance_meters?: number;
  };
}

@SkillDecorator({
  name: 'transport.search',
  description: '搜索 transport 两点间路线与耗时。POI 跳点优先驾车/步行；在 RESEARCH/VERIFY/REPAIR 阶段计算转场或校验可达性时调用。',
  version: '1.0.0',
  category: 'trip',
  toolGroup: 'DOMAIN',
})
@Injectable()
export class TransportSearchSkill implements Skill<TransportSearchInput, TransportSearchOutput> {
  private readonly logger = new Logger(TransportSearchSkill.name);

  metadata = {
    name: 'transport.search',
    description: '搜索 transport 两点间路线与耗时。在 RESEARCH/VERIFY/REPAIR 阶段计算转场或校验可达性时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
    inputSchema: {
      required: ['origin', 'destination'],
    },
  };

  constructor(
    @Optional() private readonly transportRoutingService?: TransportRoutingService,
    @Optional() private readonly entityResolutionService?: EntityResolutionService,
  ) {
    this.logger.log(`[TransportSearchSkill] 已初始化`);
  }

  async execute(input: TransportSearchInput): Promise<TransportSearchOutput> {
    this.logger.debug(`执行 transport.search: origin=${typeof input.origin === 'string' ? input.origin : `${input.origin.lat},${input.origin.lng}`}, destination=${typeof input.destination === 'string' ? input.destination : `${input.destination.lat},${input.destination.lng}`}`);

    try {
      if (!this.transportRoutingService) {
        throw new Error('TransportRoutingService 未注入');
      }

      // Coordinates required. Accept either structured coords or a parseable "lat,lng" string.
      const origin =
        typeof input.origin === 'string'
          ? await this.resolveToCoords(input.origin, input.countryCode)
          : { lat: input.origin.lat, lng: input.origin.lng };
      const destination =
        typeof input.destination === 'string'
          ? await this.resolveToCoords(input.destination, input.countryCode)
          : { lat: input.destination.lat, lng: input.destination.lng };

      if (!origin || !destination) {
        const oRef = formatEndpointForError(input.origin);
        const dRef = formatEndpointForError(input.destination);
        throw new Error(
          `${TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER} 无法发起路径规划：未能将起点或终点解析为经纬度。请使用 "lat,lng" 或可检索的具体地名。当前起点: ${oRef}；终点: ${dRef}`,
        );
      }

      const originLat = origin.lat;
      const originLng = origin.lng;
      const destLat = destination.lat;
      const destLng = destination.lng;

      const hopMode = input.mode ?? 'drive';
      const recommendation = await this.transportRoutingService.planPoiHopRoute(
        originLat,
        originLng,
        destLat,
        destLng,
        hopMode,
      );

      // 转换为输出格式
      const options = recommendation.options.map(opt => ({
        mode: opt.mode,
        duration_minutes: opt.durationMinutes,
        // TransportOption 没有 distanceMeters，使用 walkDistance 作为近似值
        distance_meters: (opt as any).distanceMeters || (opt as any).distance_meters || opt.walkDistance || 0,
        steps: (opt as any).steps || [], // TransportOption 没有 steps 字段
      }));

      return {
        evidence_id: `transport_${Date.now() * 1000 + (TRANSPORT_EVIDENCE_SEQ++ % 1000)}_${originLat}_${originLng}_${destLat}_${destLng}`,
        origin,
        destination,
        options,
        best_option: options[0],
      };
    } catch (error: any) {
      this.logger.error(`transport.search 失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /** Best-effort: accept coords strings; otherwise resolve to a place with coordinates. */
  private async resolveToCoords(
    s: string,
    countryCode?: string,
  ): Promise<{ lat: number; lng: number } | undefined> {
    const parsed = tryParseLatLngPairFromString(s);
    if (parsed) return parsed;

    const resolvedCountryCode = inferEntityResolutionCountryCode({
      countryCode,
      query: s,
    });

    // Devbox / MCP mode often disables PlacesModule, which means EntityResolutionService may be absent.
    // Provide a minimal deterministic fallback for common Iceland anchors so orchestration can proceed.
    const anchor = resolveKnownIcelandAnchor(String(s ?? ''));
    if (anchor) return anchor;

    if (!this.entityResolutionService) return undefined;

    try {
      const pack = await this.entityResolutionService.resolveEntities(
        String(s ?? ''),
        [],
        undefined,
        undefined,
        10,
        resolvedCountryCode ? { countryCode: resolvedCountryCode } : undefined,
      );
      const list = Array.isArray(pack?.results) ? pack.results : [];
      const r = list.find((x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lng));
      if (!r) return undefined;
      const lat = Number((r as any).lat);
      const lng = Number((r as any).lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
      if (lat < -90 || lat > 90) return undefined;
      if (lng < -180 || lng > 180) return undefined;
      return { lat, lng };
    } catch {
      return undefined;
    }
  }
}

/**
 * 解析可进入路由规划的 lat,lng 子串（与 transport.search 内逻辑一致）。
 * 供 RESEARCH 回填层在写入行程前做强类型坐标归一化。
 */
export function tryParseLatLngPairFromString(s: string): { lat: number; lng: number } | undefined {
  const raw = String(s ?? '').trim();
  if (!raw) return undefined;

  // Accept patterns like:
  // - "64.1265,-21.8174"
  // - "坐标 64.1265,-21.8174"
  // - "lat:64.1265 lng:-21.8174"
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90) return undefined;
  if (lng < -180 || lng > 180) return undefined;
  return { lat, lng };
}

function normalizeAnchorKey(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    // strip diacritics (e.g. Keflavík -> keflavik)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Tiny deterministic coordinate anchors for Iceland-only dev paths.
 * Not a geocoder replacement — just unblocks transport.search when PlacesModule is disabled.
 */
function resolveKnownIcelandAnchor(s: string): { lat: number; lng: number } | undefined {
  const key = normalizeAnchorKey(s);
  if (!key) return undefined;

  // Airport / city anchors (approx)
  const table: Array<{ re: RegExp; lat: number; lng: number }> = [
    { re: /\bkef\b|\bkeflavik\b|\bkeflavík\b|\bkeflavik airport\b|\bkeflavík airport\b|\breykjavik airport\b|\bkjavik airport\b/i, lat: 63.985, lng: -22.6056 },
    { re: /\breykjavik\b|\brekjavik\b|\brvk\b|\bcapital\b/i, lat: 64.1466, lng: -21.9426 },
    { re: /\bselfoss\b/i, lat: 63.933, lng: -20.997 },
    { re: /\bvik\b|\bvík\b|\bvik i myrdal\b/i, lat: 63.4194, lng: -18.9969 },
    { re: /\bhusavik\b|\bhúsavík\b/i, lat: 66.0447, lng: -17.3389 },
    { re: /\bakureyri\b/i, lat: 65.6835, lng: -18.1262 },
    { re: /\begilsstadir\b|\begilsstaðir\b/i, lat: 65.2669, lng: -14.3949 },
  ];

  for (const row of table) {
    if (row.re.test(key)) return { lat: row.lat, lng: row.lng };
  }
  // 国家/地区级（与向量召回「冰岛」等无城市字段时仍要给 routing 一个锚点，默认用首都圈）
  if (/\b(iceland|ísland|isl|冰岛|冰島)\b/i.test(key) || key === '冰岛' || key === '冰島') {
    return { lat: 64.1466, lng: -21.9426 };
  }
  return undefined;
}
