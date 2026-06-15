import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DecisionEventBus,
  DecisionEventType,
  type EventListener,
  type TripStateChangedEvent,
} from '../decision/optimization/events/decision-events';
import { buildTripStateChangedEnvelope } from './travel-event-envelope.builder';
import { TravelEventPersistenceService } from './travel-event-persistence.service';
import { isTravelEventStoreEnabled } from './travel-event-store.config';

@Injectable()
export class TravelEventSubscriberService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TravelEventSubscriberService.name);
  private tripStateChangedListener?: EventListener<TripStateChangedEvent>;

  constructor(
    private readonly eventBus: DecisionEventBus,
    private readonly persistenceService: TravelEventPersistenceService,
  ) {}

  onModuleInit(): void {
    if (!isTravelEventStoreEnabled()) {
      this.logger.log(
        '[TravelEventStore] Disabled (set TRAVEL_EVENT_STORE_ENABLED=true to enable persistence)',
      );
      return;
    }

    this.tripStateChangedListener = (event: TripStateChangedEvent) => {
      void this.handleTripStateChanged(event);
    };

    this.eventBus.on<TripStateChangedEvent>(
      DecisionEventType.TRIP_STATE_CHANGED,
      this.tripStateChangedListener,
    );

    this.logger.log('[TravelEventStore] Subscribed to TRIP_STATE_CHANGED');
  }

  onModuleDestroy(): void {
    if (this.tripStateChangedListener) {
      this.eventBus.off(
        DecisionEventType.TRIP_STATE_CHANGED,
        this.tripStateChangedListener as EventListener,
      );
    }
  }

  async handleTripStateChanged(event: TripStateChangedEvent): Promise<void> {
    try {
      const envelope = buildTripStateChangedEnvelope(event);
      await this.persistenceService.persist(envelope);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[TravelEventStore] Failed to handle TRIP_STATE_CHANGED for trip ${event.tripId}: ${message}`,
      );
    }
  }
}
