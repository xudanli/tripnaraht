import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DecisionMemory } from './decision-memory.types';
import type { WorldDecisionArchivePersistInput, WorldDecisionMemoryArchivePort } from './world-decision-memory-archive.port';

function isDecisionMemoryPayload(x: unknown): x is DecisionMemory {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.causalityId === 'string' &&
    typeof o.decisionType === 'string' &&
    typeof o.outcome === 'string' &&
    Array.isArray(o.rationale) &&
    Array.isArray(o.causedBy) &&
    typeof o.timestamp === 'number' &&
    o.inputs !== null &&
    typeof o.inputs === 'object' &&
    o.outputs !== null &&
    typeof o.outputs === 'object'
  );
}

@Injectable()
export class PrismaWorldDecisionMemoryArchiveService implements WorldDecisionMemoryArchivePort {
  private readonly logger = new Logger(PrismaWorldDecisionMemoryArchiveService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return this.prisma.isDbConnected();
  }

  async persist(input: WorldDecisionArchivePersistInput): Promise<void> {
    if (!this.isEnabled()) return;
    const tripId = input.tripId?.trim() ? input.tripId.trim() : null;
    const userId = input.userId?.trim() ? input.userId.trim() : null;
    try {
      await this.prisma.tripWorldDecisionMemory.create({
        data: {
          tripId: tripId ?? undefined,
          userId: userId ?? undefined,
          requestId: input.requestId,
          causalityId: input.entry.causalityId,
          decisionType: input.entry.decisionType,
          outcome: input.entry.outcome,
          payload: input.entry as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        this.logger.debug(
          `TripWorldDecisionMemory duplicate skip requestId=${input.requestId} causalityId=${input.entry.causalityId}`,
        );
        return;
      }
      this.logger.warn(`TripWorldDecisionMemory persist failed: ${e?.message ?? e}`);
    }
  }

  async listRecentForTrip(tripId: string, limit: number): Promise<DecisionMemory[]> {
    if (!this.isEnabled()) return [];
    const tid = String(tripId).trim();
    if (!tid) return [];
    const cap = Math.min(Math.max(1, limit), 200);
    const rows = await this.prisma.tripWorldDecisionMemory.findMany({
      where: { tripId: tid },
      orderBy: { createdAt: 'desc' },
      take: cap,
    });
    const out: DecisionMemory[] = [];
    for (const r of rows) {
      if (isDecisionMemoryPayload(r.payload)) {
        out.push(r.payload);
      }
    }
    return out;
  }
}
