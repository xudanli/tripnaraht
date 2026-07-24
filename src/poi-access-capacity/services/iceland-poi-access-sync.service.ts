/**
 * 冰岛 POI 准入状态同步 — 官方公告 → poi_access_status_overrides
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PoiAccessStatusOverride } from '../interfaces/poi-access-capacity.interface';
import { VatnajokullTrailStatusProvider } from '../providers/vatnajokull-trail-status.provider';
import { DyrholaeyBreedingStatusProvider } from '../providers/dyrholaey-breeding-status.provider';

export type PoiAccessSyncResult = {
  source: string;
  overridesUpserted: number;
  overrideIds: string[];
};

export type PoiAccessSyncAllResult = {
  vatnajokull: PoiAccessSyncResult;
  dyrholaey: PoiAccessSyncResult;
};

@Injectable()
export class IcelandPoiAccessSyncService {
  private readonly logger = new Logger(IcelandPoiAccessSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vatnajokullProvider: VatnajokullTrailStatusProvider,
    private readonly dyrholaeyProvider: DyrholaeyBreedingStatusProvider,
  ) {}

  async syncAll(): Promise<PoiAccessSyncAllResult> {
    const [vatnajokull, dyrholaey] = await Promise.all([
      this.syncVatnajokullTrailStatus(),
      this.syncDyrholaeyBreedingStatus(),
    ]);
    return { vatnajokull, dyrholaey };
  }

  async syncVatnajokullTrailStatus(): Promise<PoiAccessSyncResult> {
    const snapshot = await this.vatnajokullProvider.loadSnapshot();
    if (!snapshot) {
      this.logger.warn('无 Vatnajökull 步道快照可同步');
      return { source: 'none', overridesUpserted: 0, overrideIds: [] };
    }

    const overrides = this.vatnajokullProvider.toStatusOverrides(snapshot);
    const ids = await this.upsertOverrides(overrides);

    this.logger.log(
      `Vatnajökull 同步完成: ${ids.length} 条覆盖 (${snapshot.source})`,
    );

    return {
      source: snapshot.source,
      overridesUpserted: ids.length,
      overrideIds: ids,
    };
  }

  async syncDyrholaeyBreedingStatus(): Promise<PoiAccessSyncResult> {
    const snapshot = await this.dyrholaeyProvider.loadSnapshot();
    if (!snapshot) {
      this.logger.warn('无 Dyrhólaey 繁殖期快照可同步');
      return { source: 'none', overridesUpserted: 0, overrideIds: [] };
    }

    const override = this.dyrholaeyProvider.toStatusOverride(snapshot);
    const ids = await this.upsertOverrides([override]);

    this.logger.log(
      `Dyrhólaey 同步完成: ${ids.length} 条覆盖 (${snapshot.source}) status=${snapshot.status}`,
    );

    return {
      source: snapshot.source,
      overridesUpserted: ids.length,
      overrideIds: ids,
    };
  }

  async upsertOverrides(overrides: PoiAccessStatusOverride[]): Promise<string[]> {
    const ids: string[] = [];
    for (const override of overrides) {
      await this.prisma.poiAccessStatusOverride.upsert({
        where: { id: override.id },
        create: {
          id: override.id,
          poiId: override.poiId,
          placeId: override.placeId ?? null,
          ruleType: override.ruleType,
          targetResource: override.targetResource,
          enforcement: override.enforcement ?? 'HARD',
          effectiveFrom: new Date(override.effectiveFrom),
          effectiveTo: override.effectiveTo ? new Date(override.effectiveTo) : null,
          status: override.status,
          sourceAuthority: override.sourceAuthority,
          sourceUrl: override.sourceUrl ?? null,
          lastVerifiedAt: new Date(override.lastVerifiedAt),
          confidence: override.confidence,
          notes: override.notes ?? null,
        },
        update: {
          status: override.status,
          enforcement: override.enforcement ?? 'HARD',
          effectiveFrom: new Date(override.effectiveFrom),
          effectiveTo: override.effectiveTo ? new Date(override.effectiveTo) : null,
          sourceAuthority: override.sourceAuthority,
          sourceUrl: override.sourceUrl ?? null,
          lastVerifiedAt: new Date(override.lastVerifiedAt),
          confidence: override.confidence,
          notes: override.notes ?? null,
        },
      });
      ids.push(override.id);
    }
    return ids;
  }
}
