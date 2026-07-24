/**
 * Vatnajökull 国家公园步道状态 — 官方公告采集 Provider
 *
 * 优先级：本地 JSON 快照 > HTTP 抓取（需 VATTNAJOKULL_TRAIL_STATUS_URL）
 * 输出统一为 PoiAccessStatusOverride 候选
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PoiAccessStatusOverride } from '../interfaces/poi-access-capacity.interface';
import { ICELAND_B_TIER_POI_SLUGS } from '../fixtures/is-b-tier.rules';

export type VatnajokullTrailStatusEntry = {
  trailId: string;
  trailName: string;
  status: 'OPEN' | 'CLOSED' | 'LIMITED';
  effectiveFrom: string;
  effectiveTo?: string;
  sourceUrl?: string;
  notes?: string;
  lastVerifiedAt: string;
};

export type VatnajokullTrailStatusSnapshot = {
  fetchedAt: string;
  source: string;
  trails: VatnajokullTrailStatusEntry[];
};

const TRAIL_TO_POI: Record<string, { poiId: string; ruleType: 'TRAIL_RESTRICTION'; targetResource: 'TRAIL' }> = {
  S3: { poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL, ruleType: 'TRAIL_RESTRICTION', targetResource: 'TRAIL' },
  S4: { poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL, ruleType: 'TRAIL_RESTRICTION', targetResource: 'TRAIL' },
  'kristinartindar': { poiId: ICELAND_B_TIER_POI_SLUGS.SKAFTAFELL, ruleType: 'TRAIL_RESTRICTION', targetResource: 'TRAIL' },
};

@Injectable()
export class VatnajokullTrailStatusProvider {
  private readonly logger = new Logger(VatnajokullTrailStatusProvider.name);

  private defaultSnapshotPath(): string {
    return join(process.cwd(), 'data/poi-access-capacity/vatnajokull-trail-status.json');
  }

  loadLocalSnapshot(path?: string): VatnajokullTrailStatusSnapshot | undefined {
    const filePath = path ?? this.defaultSnapshotPath();
    if (!existsSync(filePath)) {
      this.logger.debug(`本地步道快照不存在: ${filePath}`);
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as VatnajokullTrailStatusSnapshot;
    } catch (err) {
      this.logger.warn(`解析步道快照失败: ${(err as Error).message}`);
      return undefined;
    }
  }

  async fetchRemoteSnapshot(): Promise<VatnajokullTrailStatusSnapshot | undefined> {
    const url =
      process.env.VATTNAJOKULL_TRAIL_STATUS_URL ??
      'https://www.vatnajokulsthjodgardur.is/en/trails/skaftafell';
    if (process.env.VATTNAJOKULL_TRAIL_FETCH_ENABLED !== 'true') {
      return undefined;
    }

    try {
      const res = await fetch(url, {
        headers: { Accept: 'text/html,application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.warn(`Vatnajökull 抓取 HTTP ${res.status}`);
        return undefined;
      }
      const contentType = res.headers.get('content-type') ?? '';
      const body = await res.text();
      if (contentType.includes('application/json')) {
        return JSON.parse(body) as VatnajokullTrailStatusSnapshot;
      }
      return this.parseTrailStatusFromHtml(body, url);
    } catch (err) {
      this.logger.warn(`Vatnajökull 抓取失败: ${(err as Error).message}`);
      return undefined;
    }
  }

  /** 简易 HTML 启发式：closed / open 关键词（正式接入应换结构化 API） */
  parseTrailStatusFromHtml(html: string, sourceUrl: string): VatnajokullTrailStatusSnapshot | undefined {
    const lower = html.toLowerCase();
    const trails: VatnajokullTrailStatusEntry[] = [];
    const now = new Date().toISOString();

    if (/s3|trail.*3/i.test(html)) {
      const closed = /s3[^<]{0,200}closed|closed[^<]{0,200}s3/i.test(lower);
      trails.push({
        trailId: 'S3',
        trailName: 'S3',
        status: closed ? 'CLOSED' : 'OPEN',
        effectiveFrom: now.slice(0, 10),
        sourceUrl,
        lastVerifiedAt: now,
        notes: closed ? '页面检测到 S3 closed' : '页面未检测到 S3 closed',
      });
    }

    if (trails.length === 0) return undefined;
    return { fetchedAt: now, source: 'vatnajokull_html_heuristic', trails };
  }

  toStatusOverrides(snapshot: VatnajokullTrailStatusSnapshot): PoiAccessStatusOverride[] {
    const overrides: PoiAccessStatusOverride[] = [];

    for (const trail of snapshot.trails) {
      const mapping = TRAIL_TO_POI[trail.trailId.toLowerCase()] ?? TRAIL_TO_POI[trail.trailId];
      if (!mapping) continue;

      const id = `sync.vatnajokull.${trail.trailId.toLowerCase()}.${trail.effectiveFrom.slice(0, 10)}`;

      if (trail.status === 'OPEN') {
        overrides.push({
          id,
          poiId: mapping.poiId,
          ruleType: mapping.ruleType,
          targetResource: mapping.targetResource,
          effectiveFrom: `${trail.effectiveFrom.slice(0, 10)}T00:00:00.000Z`,
          effectiveTo: trail.effectiveTo ? `${trail.effectiveTo.slice(0, 10)}T23:59:59.000Z` : undefined,
          status: 'INACTIVE',
          sourceAuthority: 'Vatnajökull National Park',
          sourceUrl: trail.sourceUrl ?? snapshot.source,
          lastVerifiedAt: trail.lastVerifiedAt,
          confidence: 'OFFICIAL',
          notes: `${trail.trailName} 官方状态：开放`,
        });
        continue;
      }

      if (trail.status === 'CLOSED' || trail.status === 'LIMITED') {
        overrides.push({
          id,
          poiId: mapping.poiId,
          ruleType: mapping.ruleType,
          targetResource: mapping.targetResource,
          effectiveFrom: `${trail.effectiveFrom.slice(0, 10)}T00:00:00.000Z`,
          effectiveTo: trail.effectiveTo ? `${trail.effectiveTo.slice(0, 10)}T23:59:59.000Z` : undefined,
          status: 'ACTIVE',
          enforcement: 'HARD',
          sourceAuthority: 'Vatnajökull National Park',
          sourceUrl: trail.sourceUrl ?? snapshot.source,
          lastVerifiedAt: trail.lastVerifiedAt,
          confidence: 'OFFICIAL',
          notes: trail.notes ?? `${trail.trailName} 官方状态：${trail.status === 'CLOSED' ? '关闭' : '限制'}`,
        });
      }
    }

    return overrides;
  }

  async loadSnapshot(): Promise<VatnajokullTrailStatusSnapshot | undefined> {
    const remote = await this.fetchRemoteSnapshot();
    if (remote) return remote;
    return this.loadLocalSnapshot();
  }
}
