import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  TravelEventEnvelope,
  TravelEventPersistenceResult,
} from './types/travel-event.types';
import { isTravelEventStoreEnabled } from './travel-event-store.config';

@Injectable()
export class TravelEventPersistenceService {
  private readonly logger = new Logger(TravelEventPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  isEnabled(): boolean {
    return isTravelEventStoreEnabled();
  }

  /**
   * Persist a travel event envelope. Fail-open: persistence errors never throw.
   */
  async persist(envelope: TravelEventEnvelope): Promise<TravelEventPersistenceResult> {
    if (!this.isEnabled()) {
      return {
        persisted: false,
        eventId: envelope.eventId,
      };
    }

    try {
      await this.prisma.travelEvent.create({
        data: {
          id: envelope.eventId,
          tripId: envelope.tripId,
          eventType: envelope.eventType,
          segment: envelope.segment,
          occurredAt: new Date(envelope.timestamp),
          actorUserId: envelope.userId,
          requestId: envelope.requestId,
          source: envelope.source,
          schemaVersion: envelope.schemaVersion,
          payload: envelope.payload as Prisma.InputJsonValue,
          metadata: envelope.metadata as Prisma.InputJsonValue | undefined,
          idempotencyKey: envelope.idempotencyKey,
        },
      });

      return {
        persisted: true,
        eventId: envelope.eventId,
      };
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        this.logger.debug(
          `[TravelEventStore] Duplicate event skipped: ${envelope.idempotencyKey}`,
        );
        return {
          persisted: false,
          eventId: envelope.eventId,
          duplicate: true,
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[TravelEventStore] Failed to persist event ${envelope.eventId}: ${message}`,
      );
      return {
        persisted: false,
        eventId: envelope.eventId,
        error: message,
      };
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
