import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ItineraryRevision } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RevisionNarratorService } from './revision-narrator.service';
import type { RevisionTimelineItemDto } from '../dto/itinerary-revision-timeline.dto';

@Injectable()
export class ItineraryRevisionTimelineService {
  private readonly logger = new Logger(ItineraryRevisionTimelineService.name);

  constructor(
    private readonly narrator: RevisionNarratorService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * Streams all revisions for a trip in chronological order (BASELINE → … → latest CONFIRMED).
   */
  async listTimelineForTrip(tripId: string): Promise<RevisionTimelineItemDto[]> {
    const id = String(tripId ?? '').trim();
    if (!id) return [];
    if (!this.prisma) {
      this.logger.debug('listTimelineForTrip: Prisma unavailable, empty timeline');
      return [];
    }

    const rows = await this.prisma.itineraryRevision.findMany({
      where: { tripId: id },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((row) => this.toTimelineItem(row));
  }

  private toTimelineItem(row: ItineraryRevision): RevisionTimelineItemDto {
    const interruptedRaw = row.interruptedItems;
    const interruptedArr = Array.isArray(interruptedRaw)
      ? (interruptedRaw as Array<{ item_id: string; field: string }>)
      : [];
    const interruptedCount = interruptedArr.length;

    const { text, locale } = this.narrator.narrate(
      {
        kind: row.kind,
        resolutionType: row.resolutionType ?? row.alternativeId ?? null,
        resolutionPatchSummary: row.resolutionPatchSummary ?? null,
        deltaTimeMinutes: row.deltaTimeMinutes ?? null,
        deltaCostUsd: row.deltaCostUsd ?? null,
        interruptedCount,
      },
      { locale: 'zh' },
    );

    const interrupted_enriched =
      interruptedArr.length > 0 ? this.narrator.enrichInterruptedItems(interruptedArr, row.snapshot) : interruptedArr;

    const impact_summary =
      interruptedArr.length > 0
        ? this.narrator.getImpactSummary({
            kind: row.kind,
            interrupted_items: interruptedArr,
            snapshot: row.snapshot,
          }) || undefined
        : undefined;

    return {
      revision_id: row.id,
      kind: row.kind,
      created_at: row.createdAt,
      parent_revision_id: row.parentRevisionId ?? null,
      rollback_to_revision_id: row.kind === 'BASELINE' ? null : (row.parentRevisionId ?? null),
      resolution_type: row.resolutionType ?? null,
      alternative_id: row.alternativeId ?? null,
      resolution_patch_summary: row.resolutionPatchSummary ?? null,
      delta_cost_usd: row.deltaCostUsd ?? null,
      delta_time_minutes: row.deltaTimeMinutes ?? null,
      interrupted_items: interrupted_enriched,
      ...(impact_summary ? { impact_summary } : {}),
      narrative: text,
      narrative_locale: locale,
    };
  }
}
