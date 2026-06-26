import { Injectable, Logger, Optional } from '@nestjs/common';
import { TravelEventPersistenceService } from '../event-store/travel-event-persistence.service';
import type { DecisionCausalityRecord } from './decision-causality-v1.types';
import { buildDecisionCausalityTravelEventEnvelope } from './travel-event-causality.builder';

/**
 * Fail-open dual-write: persist decision causality rows to Travel Event Store (DECISION segment).
 */
@Injectable()
export class CausalTravelEventEmitterService {
  private readonly logger = new Logger(CausalTravelEventEmitterService.name);

  constructor(
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async emitDecisionCausalityRecord(input: {
    tripId: string;
    record: DecisionCausalityRecord;
    requestId?: string;
    userId?: string;
  }): Promise<{ persisted: boolean; eventId?: string }> {
    if (!this.travelEventPersistence?.isEnabled()) {
      return { persisted: false };
    }

    try {
      const envelope = buildDecisionCausalityTravelEventEnvelope(input);
      const result = await this.travelEventPersistence.persist(envelope);
      if (result.persisted) {
        this.logger.debug(
          `[CausalRuntime] travel_event persisted causality_id=${input.record.causality_id}`,
        );
      }
      return { persisted: result.persisted, eventId: result.eventId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[CausalRuntime] travel_event emit failed: ${message}`);
      return { persisted: false };
    }
  }
}
