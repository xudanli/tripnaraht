import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ItineraryRevisionAuditDelta } from '../../../agent/services/audit-record.service';
import type {
  AlignmentTier3Batch,
  CausalAlignmentTuple,
} from '../../execution-simulation/alignment-tier3.types';
import { captureAlignmentTupleFromRevision } from '../../execution-closure-persistence/capture-alignment-tuple.util';
import {
  extractRmHintsFromTripMetadata,
  mergeAlignmentTupleIntoTripMetadata,
  loadAlignmentTier3Bundle,
} from '../../execution-closure-persistence/persist-alignment-tier3';
import type { AlignmentTier3RmHints } from '../../execution-closure-persistence/alignment-tier3-serialization';

export type CaptureAlignmentFromRevisionParams = {
  tripId: string;
  parentSnapshot: unknown;
  childSnapshot: unknown;
  audit: ItineraryRevisionAuditDelta;
  revisionId?: string;
  source?: AlignmentTier3Batch['source'] | string;
};

/**
 * Persists {@link CausalAlignmentTuple} under `Trip.metadata.alignmentTier3V1`
 * for RM calibration / regret pipeline (P1-A).
 */
@Injectable()
export class AlignmentTier3PersistenceService {
  private readonly logger = new Logger(AlignmentTier3PersistenceService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  buildTuple(params: CaptureAlignmentFromRevisionParams): CausalAlignmentTuple {
    return captureAlignmentTupleFromRevision({
      tripId: params.tripId,
      parentSnapshot: params.parentSnapshot,
      childSnapshot: params.childSnapshot,
      audit: params.audit,
      revisionId: params.revisionId,
      source: params.source,
    });
  }

  async loadRmHints(tripId: string): Promise<AlignmentTier3RmHints | null> {
    if (!this.prisma) return null;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip?.metadata) return null;
    return extractRmHintsFromTripMetadata(trip.metadata);
  }

  async loadTuples(tripId: string): Promise<CausalAlignmentTuple[]> {
    if (!this.prisma) return [];
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const { envelope } = loadAlignmentTier3Bundle(trip?.metadata);
    return envelope?.tuples ?? [];
  }

  /**
   * Capture tuple from revision delta and append to Trip.metadata ring buffer.
   */
  async captureAndPersist(
    params: CaptureAlignmentFromRevisionParams,
  ): Promise<{ ok: boolean; tupleId?: string; conflict?: boolean }> {
    const tripId = String(params.tripId ?? '').trim();
    if (!tripId || !this.prisma) {
      this.logger.debug('captureAndPersist: skip (no tripId or Prisma)');
      return { ok: false };
    }

    const tuple = this.buildTuple(params);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const trip = await tx.trip.findUnique({
          where: { id: tripId },
          select: { metadata: true },
        });
        if (!trip) {
          this.logger.debug(`captureAndPersist: trip ${tripId} not found`);
          return { ok: false };
        }
        const prev = (trip.metadata as Record<string, unknown>) ?? {};
        const { metadata, envelope } = mergeAlignmentTupleIntoTripMetadata(prev, tuple);
        await tx.trip.update({
          where: { id: tripId },
          data: {
            metadata: JSON.parse(JSON.stringify(metadata)) as object,
            updatedAt: new Date(),
          },
        });
        this.logger.debug(
          `captureAndPersist: trip=${tripId} tuple=${tuple.tupleId} count=${envelope.tuples.length} org=${envelope.rmHints.organizationalWeight.toFixed(2)} phys=${envelope.rmHints.physicalWeight.toFixed(2)}`,
        );
        return { ok: true, tupleId: tuple.tupleId };
      });
    } catch (e) {
      this.logger.warn(`captureAndPersist failed: ${(e as Error)?.message ?? e}`);
      return { ok: false };
    }
  }

  /** Fire-and-forget wrapper — never blocks revision / rollback paths. */
  scheduleCapture(params: CaptureAlignmentFromRevisionParams): void {
    void this.captureAndPersist(params).catch((e) => {
      this.logger.warn(`scheduleCapture async failed: ${(e as Error)?.message ?? e}`);
    });
  }
}
