import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import type { CanonicalCausalTraceV1 } from '../causal-trace.types';
import type { CanonicalCausalTraceStore } from './canonical-causal-trace.store';

const METADATA_KEY = 'canonicalCausalTracesV1';
const MAX_TRACES_PER_TRIP = 100;

interface CausalTraceMetadataBlock {
  traces: CanonicalCausalTraceV1[];
  lastUpdatedAt?: string;
}

@Injectable()
export class CanonicalCausalTracePersistenceService {
  private readonly logger = new Logger(CanonicalCausalTracePersistenceService.name);
  private readonly hydratedTrips = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async hydrateTrip(tripId: string, store: CanonicalCausalTraceStore): Promise<void> {
    if (this.hydratedTrips.has(tripId)) return;
    this.hydratedTrips.add(tripId);

    const block = await this.readBlock(tripId);
    for (const trace of block.traces) {
      if (trace.tripId === tripId) {
        store.save(trace);
      }
    }
  }

  async upsertTrace(trace: CanonicalCausalTraceV1): Promise<void> {
    const block = await this.readBlock(trace.tripId);
    const existing = block.traces.find((t) => t.traceId === trace.traceId);
    const merged = existing ? this.mergeTrace(existing, trace) : trace;
    const others = block.traces.filter((t) => t.traceId !== merged.traceId);
    const traces = [...others, merged]
      .filter((t) => t.tripId === merged.tripId)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
      .slice(-MAX_TRACES_PER_TRIP);

    await this.writeBlock(merged.tripId, { traces, lastUpdatedAt: new Date().toISOString() });
    this.hydratedTrips.add(merged.tripId);
  }

  private mergeTrace(
    existing: CanonicalCausalTraceV1,
    incoming: CanonicalCausalTraceV1,
  ): CanonicalCausalTraceV1 {
    const rank = (status: CanonicalCausalTraceV1['status']): number => {
      switch (status) {
        case 'CALIBRATED':
          return 5;
        case 'EXECUTED':
          return 4;
        case 'SELECTED':
          return 3;
        case 'EXECUTING':
          return 2;
        case 'PREVIEW':
          return 1;
        default:
          return 0;
      }
    };
    const status = rank(incoming.status) >= rank(existing.status) ? incoming.status : existing.status;
    return {
      ...existing,
      ...incoming,
      status,
      calibration: incoming.calibration ?? existing.calibration,
      executionRef: incoming.executionRef ?? existing.executionRef,
      outcomeRef: incoming.outcomeRef ?? existing.outcomeRef,
      selectedOptionId: incoming.selectedOptionId ?? existing.selectedOptionId,
      updatedAt:
        incoming.updatedAt >= existing.updatedAt ? incoming.updatedAt : existing.updatedAt,
    };
  }

  invalidateTripCache(tripId: string): void {
    this.hydratedTrips.delete(tripId);
  }

  private async readBlock(tripId: string): Promise<CausalTraceMetadataBlock> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const block = meta[METADATA_KEY] as CausalTraceMetadataBlock | undefined;
    return { traces: block?.traces ?? [] };
  }

  private async writeBlock(tripId: string, block: CausalTraceMetadataBlock): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = ((trip?.metadata ?? {}) as Record<string, unknown>) ?? {};
    try {
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: toInputJsonValue({
            ...meta,
            [METADATA_KEY]: block,
          }),
        },
      });
    } catch (e) {
      this.logger.warn(
        `persist causal trace failed trip=${tripId}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
