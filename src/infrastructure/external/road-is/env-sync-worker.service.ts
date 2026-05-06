import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import type { SegmentLatestRoadStatusV1 } from '../../../domain/ontology/validator/road-status-contract.types';
import { RoadIsProviderService } from './road-is-provider.service';

function roadIsKeyFromSegmentRules(rules: unknown): string | null {
  if (!rules || typeof rules !== 'object') return null;
  const r = rules as Record<string, unknown>;
  const code = r.road_is_road_code ?? r.roadIsRoadCode;
  if (typeof code === 'string' && code.trim()) return code.trim();
  return null;
}

/**
 * Periodically pulls Road.is (or mock) into SpatialDomainSegment.latest_status — never blocks ActionExecution hot path.
 */
@Injectable()
export class EnvSyncWorkerService {
  private readonly logger = new Logger(EnvSyncWorkerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly roadIs: RoadIsProviderService,
    private readonly config: ConfigService,
  ) {
    this.enabled = String(this.config.get<string>('ROAD_IS_SEGMENT_SYNC_ENABLED') ?? 'false').toLowerCase() === 'true';
  }

  /** Every 10 minutes UTC — align with “async sync, atomic consume” blueprint. */
  @Cron('*/10 * * * *', { name: 'road-is-segment-sync', timeZone: 'UTC' })
  async syncSpatialSegments(): Promise<void> {
    if (!this.enabled) return;
    if (!this.prisma.isDbConnected?.()) {
      this.logger.debug('[EnvSync] skip: DB unavailable');
      return;
    }

    const segments = await this.prisma.spatialDomainSegment.findMany({
      where: { segmentType: 'F_ROAD' },
      select: { id: true, rules: true },
      take: 500,
    });

    let ok = 0;
    let skipped = 0;

    for (const seg of segments) {
      const roadKey = roadIsKeyFromSegmentRules(seg.rules);
      if (!roadKey) {
        skipped++;
        continue;
      }
      try {
        const latest: SegmentLatestRoadStatusV1 = await this.roadIs.fetchCondition(roadKey);
        latest.synced_at = new Date().toISOString();
        await this.prisma.spatialDomainSegment.update({
          where: { id: seg.id },
          data: {
            latestStatus: latest as object,
            lastSyncedAt: new Date(),
          },
        });
        ok++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[EnvSync] segment ${seg.id} sync failed: ${msg}`);
      }
    }

    if (ok > 0 || skipped > 0) {
      this.logger.log(`[EnvSync] spatial segments synced=${ok} skipped_no_key=${skipped}`);
    }
  }
}
