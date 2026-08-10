/**
 * Prisma Durable Ledger — Evidence Chain 持久化。
 * DB 不可用时静默跳过（不阻断 Outcome / 热路径进程内 Ledger）。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { MemoryEventV1 } from '../types/memory-event.types';
import type { MemoryEvidenceRefV1 } from '../types/memory-evidence-ref.types';

@Injectable()
export class PrismaTravelMemoryLedgerService {
  private readonly logger = new Logger(PrismaTravelMemoryLedgerService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  isEnabled(): boolean {
    return !!this.prisma?.isDbConnected?.();
  }

  async persistEvent(event: MemoryEventV1, tripId?: string | null): Promise<void> {
    if (!this.isEnabled() || !this.prisma) return;
    try {
      const evidenceRefs = event.evidenceRefs ?? [];
      await this.prisma.travelMemoryEvent.upsert({
        where: { id: event.memoryEventId },
        create: {
          id: event.memoryEventId,
          subjectType: event.subject.type,
          subjectId: event.subject.id,
          memoryType: event.memoryType,
          predicate: event.predicate,
          scope: event.scope,
          value: event.value as Prisma.InputJsonValue,
          lifecycleStatus: event.lifecycleStatus,
          eventStatus: event.status,
          confidence: event.confidence,
          op: event.op,
          sourceType: event.source.type,
          decisionId: event.source.decisionId ?? null,
          episodeId: event.source.episodeId ?? null,
          tripId: tripId ?? null,
          supersedesEventId: event.supersedesEventId ?? null,
          supersededBy: event.supersededBy ?? null,
          validFrom: new Date(event.validTime.from),
          validTo: event.validTime.to ? new Date(event.validTime.to) : null,
          recordedAt: new Date(event.systemTime.recordedAt),
          evidenceRefsJson: evidenceRefs as unknown as Prisma.InputJsonValue,
          evidenceRefs: {
            create: evidenceRefs.map((r) => ({
              id: randomUUID(),
              evidenceType: r.type,
              evidenceId: r.id,
              weight: r.weight ?? null,
              note: r.note ?? null,
              at: r.at ? new Date(r.at) : null,
            })),
          },
        },
        update: {
          lifecycleStatus: event.lifecycleStatus,
          eventStatus: event.status,
          confidence: event.confidence,
          supersededBy: event.supersededBy ?? null,
          supersededAt: event.supersededBy
            ? new Date(event.systemTime.recordedAt)
            : undefined,
          value: event.value as Prisma.InputJsonValue,
          evidenceRefsJson: evidenceRefs as unknown as Prisma.InputJsonValue,
        },
      });

      if (event.op === 'SUPERSEDE' && event.supersedesEventId) {
        await this.prisma.travelMemoryEvent.updateMany({
          where: { id: event.supersedesEventId },
          data: {
            eventStatus: 'SUPERSEDED',
            lifecycleStatus: 'SUPERSEDED',
            supersededBy: event.memoryEventId,
            supersededAt: new Date(event.systemTime.recordedAt),
          },
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // 表未 migrate 时不刷屏
      if (/travel_memory_events|does not exist|P2021/i.test(msg)) {
        this.logger.debug(`[TMR durable] skip persist (schema?): ${msg}`);
        return;
      }
      this.logger.warn(`[TMR durable] persist failed: ${msg}`);
    }
  }

  async listByDecisionId(decisionId: string): Promise<MemoryEventV1[]> {
    if (!this.isEnabled() || !this.prisma) return [];
    try {
      const rows = await this.prisma.travelMemoryEvent.findMany({
        where: { decisionId },
        orderBy: { recordedAt: 'asc' },
        take: 100,
      });
      return rows.map((r) => this.rowToEvent(r));
    } catch {
      return [];
    }
  }

  async getById(memoryEventId: string): Promise<MemoryEventV1 | null> {
    if (!this.isEnabled() || !this.prisma) return null;
    try {
      const row = await this.prisma.travelMemoryEvent.findUnique({
        where: { id: memoryEventId },
      });
      return row ? this.rowToEvent(row) : null;
    } catch {
      return null;
    }
  }

  async listBySubjectPredicate(
    subjectId: string,
    predicate?: string,
  ): Promise<MemoryEventV1[]> {
    if (!this.isEnabled() || !this.prisma) return [];
    try {
      const rows = await this.prisma.travelMemoryEvent.findMany({
        where: {
          subjectId,
          ...(predicate ? { predicate } : {}),
        },
        orderBy: { recordedAt: 'desc' },
        take: 50,
      });
      return rows.map((r) => this.rowToEvent(r));
    } catch {
      return [];
    }
  }

  private rowToEvent(r: {
    id: string;
    subjectType: string;
    subjectId: string;
    memoryType: string;
    predicate: string;
    scope: string;
    value: unknown;
    lifecycleStatus: string;
    eventStatus: string;
    confidence: number;
    op: string;
    sourceType: string;
    decisionId: string | null;
    episodeId: string | null;
    supersedesEventId: string | null;
    supersededBy: string | null;
    validFrom: Date;
    validTo: Date | null;
    recordedAt: Date;
    evidenceRefsJson: unknown;
  }): MemoryEventV1 {
    const refs = (Array.isArray(r.evidenceRefsJson)
      ? r.evidenceRefsJson
      : []) as MemoryEvidenceRefV1[];
    return {
      schemaId: 'tripnara.memory_event@v1',
      version: 1,
      memoryEventId: r.id,
      op: r.op as MemoryEventV1['op'],
      subject: {
        type: r.subjectType as MemoryEventV1['subject']['type'],
        id: r.subjectId,
      },
      memoryType: r.memoryType as MemoryEventV1['memoryType'],
      predicate: r.predicate,
      value: r.value,
      scope: r.scope as MemoryEventV1['scope'],
      source: {
        type: r.sourceType as MemoryEventV1['source']['type'],
        decisionId: r.decisionId ?? undefined,
        episodeId: r.episodeId ?? undefined,
      },
      confidence: r.confidence,
      status: r.eventStatus as MemoryEventV1['status'],
      lifecycleStatus: r.lifecycleStatus as MemoryEventV1['lifecycleStatus'],
      evidenceRefs: refs,
      supersedesEventId: r.supersedesEventId,
      supersededBy: r.supersededBy,
      validTime: {
        from: r.validFrom.toISOString(),
        to: r.validTo?.toISOString() ?? null,
      },
      systemTime: { recordedAt: r.recordedAt.toISOString() },
    };
  }
}
