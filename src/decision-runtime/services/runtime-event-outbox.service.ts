import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TravelEventPersistenceService } from '../../trips/event-store/travel-event-persistence.service';
import type {
  TravelEventEnvelope,
  TravelEventPersistenceResult,
} from '../../trips/event-store/types/travel-event.types';
import { isRuntimeEventOutboxEnabled } from '../decision-runtime.config';
import type { RuntimePrismaTx } from '../types/gate1-runtime-emit.types';

export type { RuntimePrismaTx } from '../types/gate1-runtime-emit.types';

export type RuntimeOutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface RuntimeOutboxStats {
  pending: number;
  published: number;
  failed: number;
  total: number;
}

export interface RuntimeOutboxDrainResult {
  processed: number;
  published: number;
  duplicate: number;
  failed: number;
  stillPending: number;
}

type PrismaTx = RuntimePrismaTx;

const MAX_PUBLISH_ATTEMPTS = 10;

@Injectable()
export class RuntimeEventOutboxService {
  private readonly logger = new Logger(RuntimeEventOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: TravelEventPersistenceService,
  ) {}

  isEnabled(): boolean {
    return isRuntimeEventOutboxEnabled();
  }

  async getStats(): Promise<RuntimeOutboxStats> {
    const [pending, published, failed] = await Promise.all([
      this.prisma.runtimeEventOutbox.count({ where: { status: 'PENDING' } }),
      this.prisma.runtimeEventOutbox.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.runtimeEventOutbox.count({ where: { status: 'FAILED' } }),
    ]);
    return { pending, published, failed, total: pending + published + failed };
  }

  /**
   * Stage envelope in outbox then attempt immediate publish (Phase A default path).
   */
  async stageAndPublish(
    envelope: TravelEventEnvelope,
    gate1ProjectId?: string,
  ): Promise<TravelEventPersistenceResult> {
    const rowId = await this.stage(envelope, gate1ProjectId);
    return this.publishById(rowId);
  }

  /** Insert PENDING row; idempotent on idempotency_key. */
  async stage(
    envelope: TravelEventEnvelope,
    gate1ProjectId?: string,
    tx?: PrismaTx,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const gate1FromPayload =
      typeof envelope.payload === 'object' &&
      envelope.payload !== null &&
      'gate1ProjectId' in envelope.payload
        ? String((envelope.payload as Record<string, unknown>).gate1ProjectId)
        : undefined;

    try {
      const row = await client.runtimeEventOutbox.create({
        data: {
          tripId: envelope.tripId,
          gate1ProjectId: gate1ProjectId ?? gate1FromPayload ?? null,
          eventType: envelope.eventType,
          idempotencyKey: envelope.idempotencyKey,
          envelope: envelope as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      return row.id;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        const existing = await client.runtimeEventOutbox.findUnique({
          where: { idempotencyKey: envelope.idempotencyKey },
          select: { id: true },
        });
        if (existing) return existing.id;
      }
      throw error;
    }
  }

  async publishById(outboxId: string): Promise<TravelEventPersistenceResult> {
    const row = await this.prisma.runtimeEventOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!row) {
      return { persisted: false, eventId: '', error: 'OUTBOX_ROW_NOT_FOUND' };
    }
    if (row.status === 'PUBLISHED') {
      return {
        persisted: true,
        eventId: row.travelEventId ?? row.idempotencyKey,
        duplicate: true,
      };
    }
    return this.publishRow(row);
  }

  async drainPending(limit = 100): Promise<RuntimeOutboxDrainResult> {
    const rows = await this.prisma.runtimeEventOutbox.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let published = 0;
    let duplicate = 0;
    let failed = 0;

    for (const row of rows) {
      const result = await this.publishRow(row);
      if (result.persisted) {
        if (result.duplicate) duplicate += 1;
        else published += 1;
      } else if (result.error && !result.duplicate) {
        const updated = await this.prisma.runtimeEventOutbox.findUnique({
          where: { id: row.id },
          select: { status: true },
        });
        if (updated?.status === 'FAILED') failed += 1;
      }
    }

    const stillPending = await this.prisma.runtimeEventOutbox.count({
      where: { status: 'PENDING' },
    });

    return {
      processed: rows.length,
      published,
      duplicate,
      failed,
      stillPending,
    };
  }

  private async publishRow(row: {
    id: string;
    envelope: unknown;
    publishAttempts: number;
    idempotencyKey: string;
  }): Promise<TravelEventPersistenceResult> {
    const envelope = row.envelope as TravelEventEnvelope;

    try {
      const result = await this.persistence.persist(envelope);

      if (result.persisted || result.duplicate) {
        await this.prisma.runtimeEventOutbox.update({
          where: { id: row.id },
          data: {
            status: 'PUBLISHED',
            travelEventId: result.eventId,
            publishedAt: new Date(),
            lastError: null,
            publishAttempts: { increment: 1 },
          },
        });
        return result;
      }

      return this.recordPublishFailure(row.id, row.publishAttempts, result.error ?? 'persist_failed');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return this.recordPublishFailure(row.id, row.publishAttempts, message);
    }
  }

  private async recordPublishFailure(
    outboxId: string,
    currentAttempts: number,
    error: string,
  ): Promise<TravelEventPersistenceResult> {
    const nextAttempts = currentAttempts + 1;
    const status: RuntimeOutboxStatus =
      nextAttempts >= MAX_PUBLISH_ATTEMPTS ? 'FAILED' : 'PENDING';

    await this.prisma.runtimeEventOutbox.update({
      where: { id: outboxId },
      data: {
        status,
        lastError: error.slice(0, 2000),
        publishAttempts: nextAttempts,
      },
    });

    if (status === 'FAILED') {
      this.logger.warn(`[RuntimeOutbox] Row ${outboxId} marked FAILED after ${nextAttempts} attempts`);
    }

    return { persisted: false, eventId: '', error };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }
}
