/**
 * Dyrhólaey 鸟类繁殖期状态 Provider
 */

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { PoiAccessStatusOverride } from '../interfaces/poi-access-capacity.interface';
import { ICELAND_B_TIER_POI_SLUGS } from '../fixtures/is-b-tier.rules';

export type DyrholaeyBreedingStatusSnapshot = {
  fetchedAt: string;
  source: string;
  /** OPEN | LIMITED | CLOSED */
  status: 'OPEN' | 'LIMITED' | 'CLOSED';
  effectiveFrom: string;
  effectiveTo?: string;
  sourceUrl?: string;
  notes?: string;
  lastVerifiedAt: string;
};

@Injectable()
export class DyrholaeyBreedingStatusProvider {
  private readonly logger = new Logger(DyrholaeyBreedingStatusProvider.name);

  loadLocalSnapshot(): DyrholaeyBreedingStatusSnapshot | undefined {
    const path = join(process.cwd(), 'data/poi-access-capacity/dyrholaey-breeding-status.json');
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as DyrholaeyBreedingStatusSnapshot;
    } catch (err) {
      this.logger.warn(`解析 Dyrhólaey 快照失败: ${(err as Error).message}`);
      return undefined;
    }
  }

  async fetchRemoteSnapshot(): Promise<DyrholaeyBreedingStatusSnapshot | undefined> {
    if (process.env.DYRHOlaEY_BREEDING_FETCH_ENABLED !== 'true') {
      return undefined;
    }
    const url =
      process.env.DYRHOlaEY_BREEDING_STATUS_URL ??
      'https://www.umhverfisstofnun.is/';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return undefined;
      const html = await res.text();
      const limited = /dyrh[oó]laey|closed|limit/i.test(html);
      return {
        fetchedAt: new Date().toISOString(),
        source: 'umhverfisstofnun_html_heuristic',
        status: limited ? 'LIMITED' : 'OPEN',
        effectiveFrom: new Date().toISOString().slice(0, 10),
        sourceUrl: url,
        lastVerifiedAt: new Date().toISOString(),
        notes: limited ? '页面启发式：可能有限制' : '页面启发式：未检测到关闭',
      };
    } catch (err) {
      this.logger.warn(`Dyrhólaey 抓取失败: ${(err as Error).message}`);
      return undefined;
    }
  }

  toStatusOverride(snapshot: DyrholaeyBreedingStatusSnapshot): PoiAccessStatusOverride {
    const id = `sync.dyrholaey.breeding.${snapshot.effectiveFrom.slice(0, 10)}`;

    if (snapshot.status === 'OPEN') {
      return {
        id,
        poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
        ruleType: 'TRAIL_RESTRICTION',
        targetResource: 'VIEWPOINT',
        effectiveFrom: `${snapshot.effectiveFrom.slice(0, 10)}T00:00:00.000Z`,
        effectiveTo: snapshot.effectiveTo
          ? `${snapshot.effectiveTo.slice(0, 10)}T23:59:59.000Z`
          : undefined,
        status: 'INACTIVE',
        sourceAuthority: 'Environment Agency of Iceland',
        sourceUrl: snapshot.sourceUrl,
        lastVerifiedAt: snapshot.lastVerifiedAt,
        confidence: 'OFFICIAL',
        notes: snapshot.notes ?? '当年公告确认 Dyrhólaey 开放',
      };
    }

    return {
      id,
      poiId: ICELAND_B_TIER_POI_SLUGS.DYRHOlaEY,
      ruleType: 'TRAIL_RESTRICTION',
      targetResource: 'VIEWPOINT',
      enforcement: snapshot.status === 'CLOSED' ? 'HARD' : 'HARD',
      effectiveFrom: `${snapshot.effectiveFrom.slice(0, 10)}T00:00:00.000Z`,
      effectiveTo: snapshot.effectiveTo
        ? `${snapshot.effectiveTo.slice(0, 10)}T23:59:59.000Z`
        : undefined,
      status: 'ACTIVE',
      sourceAuthority: 'Environment Agency of Iceland',
      sourceUrl: snapshot.sourceUrl,
      lastVerifiedAt: snapshot.lastVerifiedAt,
      confidence: 'OFFICIAL',
      notes:
        snapshot.notes ??
        (snapshot.status === 'CLOSED'
          ? 'Dyrhólaey 繁殖期关闭'
          : 'Dyrhólaey 繁殖期限流/部分关闭'),
    };
  }

  async loadSnapshot(): Promise<DyrholaeyBreedingStatusSnapshot | undefined> {
    return (await this.fetchRemoteSnapshot()) ?? this.loadLocalSnapshot();
  }
}
