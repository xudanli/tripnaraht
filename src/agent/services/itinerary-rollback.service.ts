import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditRecordService } from './audit-record.service';
import { AlignmentTier3PersistenceService } from '../../trips/decision/services/alignment-tier3-persistence.service';

function tripMetadataAfterRollback(metadata: unknown): Prisma.InputJsonValue {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {} as Prisma.InputJsonValue;
  }
  const m = { ...(metadata as Record<string, unknown>) };
  for (const k of [
    'negotiation_payload',
    'negotiation_session_id',
    'expected_negotiation_hash',
    'pending_user_decision',
    'route_and_run_needs_confirmation',
  ]) {
    delete m[k];
  }
  const agent = m.agent;
  if (agent && typeof agent === 'object' && !Array.isArray(agent)) {
    const a = { ...(agent as Record<string, unknown>) };
    delete a.needs_confirmation;
    delete a.negotiation_session_id;
    delete a.expected_negotiation_hash;
    if (Object.keys(a).length) m.agent = a;
    else delete m.agent;
  }
  return m as Prisma.InputJsonValue;
}

function stripResolutionAndResetPlanned(input: unknown): any {
  const it = structuredClone((input ?? {}) as any);
  const top = String(it?.status ?? '').toUpperCase();
  if (top === 'AWAITING_CONFIRMATION' || top === 'OK') {
    it.status = 'PLANNED';
  }
  const days: any[] = Array.isArray(it.days) ? it.days : [];
  for (const d of days) {
    const items: any[] = Array.isArray(d?.items) ? d.items : [];
    for (const item of items) {
      const st = String(item?.status ?? '').toUpperCase();
      if (st === 'AWAITING_CONFIRMATION' || st === 'OK') {
        item.status = 'PLANNED';
      }
      if (item.metadata && typeof item.metadata === 'object' && 'resolution' in item.metadata) {
        const { resolution: _r, ...rest } = item.metadata;
        item.metadata = Object.keys(rest).length ? rest : undefined;
      }
    }
  }
  return it;
}

export type ItineraryRollbackResult = {
  itinerary: any;
  new_revision_id: string;
  trip_id: string | null;
  rolled_back_from_revision_id: string;
  target_revision_id: string;
};

/**
 * Time-machine rollback: append-only ROLLBACK revision + cleaned itinerary for re-planning.
 */
@Injectable()
export class ItineraryRollbackService {
  private readonly logger = new Logger(ItineraryRollbackService.name);

  constructor(
    private readonly auditRecord: AuditRecordService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly alignmentTier3?: AlignmentTier3PersistenceService,
  ) {}

  /** Alias for {@link rollbackToRevision} (product: “Time Machine” one-shot). */
  rollback(targetRevisionId: string): Promise<ItineraryRollbackResult> {
    return this.rollbackToRevision(targetRevisionId);
  }

  /**
   * Restore itinerary to the snapshot of `targetRevisionId`, versioning the operation as a new ROLLBACK row
   * whose parent is the current chain head (causal closure).
   */
  async rollbackToRevision(targetRevisionId: string): Promise<ItineraryRollbackResult> {
    if (!this.prisma) {
      this.logger.warn('rollbackToRevision: Prisma unavailable');
      throw new BadRequestException({ error_code: 'ROLLBACK_STORAGE_UNAVAILABLE' });
    }
    const tid = String(targetRevisionId ?? '').trim();
    if (!tid) {
      throw new BadRequestException({ error_code: 'ROLLBACK_INVALID_REVISION_ID' });
    }

    return await this.prisma.$transaction(async (tx) => {
      const target = await tx.itineraryRevision.findUnique({ where: { id: tid } });
      if (!target) {
        throw new NotFoundException({ error_code: 'ITINERARY_REVISION_NOT_FOUND' });
      }
      const tripId = target.tripId;
      if (!tripId) {
        throw new BadRequestException({ error_code: 'ROLLBACK_REVISION_MISSING_TRIP_ID' });
      }

      const head = await tx.itineraryRevision.findFirst({
        where: { tripId },
        orderBy: { createdAt: 'desc' },
      });
      if (!head) {
        throw new BadRequestException({ error_code: 'ROLLBACK_NO_HEAD_REVISION' });
      }
      if (head.id === target.id) {
        throw new BadRequestException({ error_code: 'ROLLBACK_ALREADY_AT_TARGET' });
      }
      if (new Date(target.createdAt).getTime() > new Date(head.createdAt).getTime()) {
        throw new BadRequestException({ error_code: 'ROLLBACK_TARGET_NOT_IN_PAST' });
      }

      const cleaned = stripResolutionAndResetPlanned(target.snapshot);
      const audit = this.auditRecord.computeRollbackAuditDelta(head.snapshot, cleaned);

      const created = await tx.itineraryRevision.create({
        data: {
          tripId,
          userId: target.userId,
          negotiationSessionId: null,
          /** 被撤销的链头所采纳的方案（偏好记忆 / 时间轴过滤）。 */
          alternativeId: head.alternativeId ?? null,
          resolutionPatchSummary: `ROLLBACK: restore snapshot from revision ${target.id}`,
          snapshot: cleaned as Prisma.InputJsonValue,
          kind: 'ROLLBACK',
          parentRevisionId: head.id,
          deltaCostUsd: audit.delta_cost_usd,
          deltaTimeMinutes: audit.delta_time_minutes,
          interruptedItems: audit.interrupted_items as Prisma.InputJsonValue,
          resolutionType: 'ROLLBACK',
        },
      });

      const tripRow = await tx.trip.findUnique({
        where: { id: tripId },
        select: { id: true, metadata: true },
      });
      if (tripRow) {
        await tx.trip.update({
          where: { id: tripId },
          data: {
            status: 'PLANNING',
            metadata: tripMetadataAfterRollback(tripRow.metadata),
            updatedAt: new Date(),
          },
        });
      }

      this.alignmentTier3?.scheduleCapture({
        tripId,
        parentSnapshot: head.snapshot,
        childSnapshot: cleaned,
        audit,
        revisionId: created.id,
        source: 'itinerary-revision-regret',
      });

      return {
        itinerary: cleaned,
        new_revision_id: created.id,
        trip_id: tripId,
        rolled_back_from_revision_id: head.id,
        target_revision_id: target.id,
      };
    });
  }
}
