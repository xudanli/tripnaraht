import { Injectable, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  TravelEventEnvelope,
  TravelEventPersistenceResult,
} from './types/travel-event.types';
import { isTravelEventStoreEnabled } from './travel-event-store.config';
import { AttributionEnrichmentService } from '../attribution/services/attribution-enrichment.service';
import { AttributionContext } from '../attribution/types/decision-attribution.types';

@Injectable()
export class TravelEventPersistenceService {
  private readonly logger = new Logger(TravelEventPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly attributionEnrichmentService?: AttributionEnrichmentService,
  ) {}

  isEnabled(): boolean {
    return isTravelEventStoreEnabled();
  }

  /**
   * Persist a travel event envelope. Fail-open: persistence errors never throw.
   */
  async persist(
    envelope: TravelEventEnvelope,
    attributionContext?: AttributionContext,
  ): Promise<TravelEventPersistenceResult> {
    if (!this.isEnabled()) {
      return {
        persisted: false,
        eventId: envelope.eventId,
      };
    }

    try {
      // Enrich event with attribution if service is available and event doesn't have attribution
      let enrichedEnvelope = envelope;
      if (this.attributionEnrichmentService && !envelope.attribution) {
        enrichedEnvelope = await this.attributionEnrichmentService.enrichEvent(
          envelope,
          attributionContext,
          { enabled: true, failOnError: false, async: false },
        );
      }

      await this.prisma.travelEvent.create({
        data: {
          id: enrichedEnvelope.eventId,
          tripId: enrichedEnvelope.tripId,
          eventType: enrichedEnvelope.eventType,
          segment: enrichedEnvelope.segment,
          occurredAt: new Date(enrichedEnvelope.timestamp),
          actorUserId: enrichedEnvelope.userId,
          requestId: enrichedEnvelope.requestId,
          source: enrichedEnvelope.source,
          schemaVersion: enrichedEnvelope.schemaVersion,
          payload: enrichedEnvelope.payload as Prisma.InputJsonValue,
          metadata: enrichedEnvelope.metadata as Prisma.InputJsonValue | undefined,
          idempotencyKey: enrichedEnvelope.idempotencyKey,
          attribution: enrichedEnvelope.attribution as unknown as Prisma.InputJsonValue | undefined,
        },
      });

      return {
        persisted: true,
        eventId: enrichedEnvelope.eventId,
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
