import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRecordService, type ItineraryRevisionAuditDelta } from './audit-record.service';

export type PersistNegotiationConfirmResult = {
  baseline_revision_id: string | null;
  confirmed_revision_id: string;
  parent_revision_id: string | null;
  audit: ItineraryRevisionAuditDelta;
};

/**
 * Append-only itinerary snapshots for negotiation confirm (revision chain + audit).
 */
@Injectable()
export class ItineraryVersionService {
  private readonly logger = new Logger(ItineraryVersionService.name);

  constructor(
    private readonly auditRecord: AuditRecordService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** Merge mechanical patch line with negotiation narrative + chosen-alternative reasoning tags for audit UI. */
  composeResolutionPatchSummary(params: {
    mechanicalSummary: string;
    negotiationPayload?: unknown;
    alternativeId: string;
  }): string {
    const mech = String(params.mechanicalSummary ?? '').trim();
    const np = params.negotiationPayload as any;
    const parts: string[] = mech ? [mech] : [];
    const narrative = String(np?.recommendation_summary ?? '').trim();
    if (narrative) parts.push(`NARRATIVE: ${narrative}`);
    const alts = np?.alternatives;
    const chosen = Array.isArray(alts)
      ? alts.find((a: any) => String(a?.id ?? '') === String(params.alternativeId))
      : undefined;
    const tags = Array.isArray(chosen?.reasoning_tags) ? chosen.reasoning_tags.map((t: any) => String(t)).sort() : [];
    if (tags.length) parts.push(`REASONING_TAGS: ${tags.join(',')}`);
    return parts.join(' | ');
  }

  /**
   * First confirm for a trip: BASELINE (pre-confirm) + CONFIRMED (post-confirm).
   * Subsequent confirms: CONFIRMED only, parent = latest revision for that trip.
   */
  async persistSuccessfulNegotiationConfirm(params: {
    tripId: string | null | undefined;
    userId: string | null | undefined;
    sessionId: string;
    alternativeId: string;
    resolutionPatchSummary: string;
    preItinerary: unknown;
    postItinerary: unknown;
    negotiationPayload?: unknown;
  }): Promise<PersistNegotiationConfirmResult | null> {
    if (!this.prisma) {
      this.logger.debug('persistSuccessfulNegotiationConfirm: Prisma unavailable, skip');
      return null;
    }
    const tripId = params.tripId != null && String(params.tripId).trim() !== '' ? String(params.tripId).trim() : null;
    if (!tripId) {
      this.logger.debug('persistSuccessfulNegotiationConfirm: no trip_id, skip DB revision');
      return null;
    }

    try {
      const latest = await this.prisma.itineraryRevision.findFirst({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      });

      let parentForConfirmed: string | null = null;
      let baselineId: string | null = null;

      if (!latest) {
        const baseline = await this.prisma.itineraryRevision.create({
          data: {
            tripId,
            userId: params.userId ?? null,
            negotiationSessionId: params.sessionId,
            alternativeId: null,
            resolutionPatchSummary: 'BASELINE: pre-negotiation-confirm snapshot',
            snapshot: params.preItinerary as Prisma.InputJsonValue,
            kind: 'BASELINE',
            parentRevisionId: null,
          },
        });
        baselineId = baseline.id;
        parentForConfirmed = baseline.id;
      } else {
        parentForConfirmed = latest.id;
      }

      const parentSnapshot = latest ? latest.snapshot : params.preItinerary;
      const audit = this.auditRecord.computeRevisionAuditDelta({
        parentSnapshot,
        childSnapshot: params.postItinerary,
        alternativeId: params.alternativeId,
        negotiationPayload: params.negotiationPayload,
      });

      const resolutionPatchSummary = this.composeResolutionPatchSummary({
        mechanicalSummary: params.resolutionPatchSummary,
        negotiationPayload: params.negotiationPayload,
        alternativeId: params.alternativeId,
      });

      const confirmed = await this.prisma.itineraryRevision.create({
        data: {
          tripId,
          userId: params.userId ?? null,
          negotiationSessionId: params.sessionId,
          alternativeId: params.alternativeId,
          resolutionPatchSummary,
          snapshot: params.postItinerary as Prisma.InputJsonValue,
          kind: 'CONFIRMED',
          parentRevisionId: parentForConfirmed,
          deltaCostUsd: audit.delta_cost_usd,
          deltaTimeMinutes: audit.delta_time_minutes,
          interruptedItems: audit.interrupted_items as Prisma.InputJsonValue,
          resolutionType: audit.resolution_type,
        },
      });

      return {
        baseline_revision_id: baselineId,
        confirmed_revision_id: confirmed.id,
        parent_revision_id: parentForConfirmed,
        audit,
      };
    } catch (e) {
      this.logger.warn(`persistSuccessfulNegotiationConfirm failed: ${(e as Error)?.message ?? e}`);
      return null;
    }
  }

  /** Merge revision pointers into any item that already has metadata.resolution (from NegotiationResolver). */
  applyRevisionMetadataToItinerary(
    itinerary: any,
    ids: { revision_id: string; parent_revision_id: string | null },
  ): void {
    const days: any[] = Array.isArray(itinerary?.days) ? itinerary.days : [];
    for (const d of days) {
      const items: any[] = Array.isArray(d?.items) ? d.items : [];
      for (const it of items) {
        const res = it?.metadata?.resolution;
        if (!res?.locked_by) continue;
        it.metadata = { ...(it.metadata ?? {}), resolution: { ...res, ...ids } };
      }
    }
  }

  async getRevisionById(revisionId: string) {
    if (!this.prisma) return null;
    return this.prisma.itineraryRevision.findUnique({ where: { id: revisionId } });
  }
}
