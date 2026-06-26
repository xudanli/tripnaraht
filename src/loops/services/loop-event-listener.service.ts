import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import {
  DecisionEventBus,
  DecisionEventType,
  type EventListener,
  type TripStateChangedEvent,
} from '../../trips/decision/optimization/events/decision-events';
import { LoopTriggerService } from './loop-trigger.service';
import { LoopLearningBridgeService } from './loop-learning-bridge.service';
import {
  isLoopAutoTriggerEnabled,
  loopAutoTriggerOnPlanning,
  isTripCompletedLearningEnabled,
} from '../loop-engineering.config';

@Injectable()
export class LoopEventListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoopEventListenerService.name);
  private tripStateListener?: (event: TripStateChangedEvent) => void;

  constructor(
    private readonly eventBus: DecisionEventBus,
    @Optional() private readonly loopTrigger?: LoopTriggerService,
    @Optional() private readonly loopLearningBridge?: LoopLearningBridgeService,
  ) {}

  onModuleInit(): void {
    const planningAutoTrigger = isLoopAutoTriggerEnabled();
    const tripCompletedLearning = isTripCompletedLearningEnabled();

    if (!planningAutoTrigger && !tripCompletedLearning) {
      this.logger.log(
        '[LoopTrigger] Auto handlers disabled (LOOP_AUTO_TRIGGER_ENABLED or LOOP_TRIP_COMPLETED_LEARNING_ENABLED)',
      );
      return;
    }

    this.tripStateListener = (event: TripStateChangedEvent) => {
      void this.handleTripStateChanged(event);
    };

    this.eventBus.on<TripStateChangedEvent>(
      DecisionEventType.TRIP_STATE_CHANGED,
      this.tripStateListener,
    );

    if (planningAutoTrigger) {
      this.logger.log('[LoopTrigger] Subscribed TRIP_STATE_CHANGED → PLANNING readiness-repair');
    }
    if (tripCompletedLearning && this.loopLearningBridge) {
      this.logger.log('[LoopLearning] Subscribed TRIP_STATE_CHANGED → COMPLETED learning sweep');
    }
  }

  onModuleDestroy(): void {
    if (this.tripStateListener) {
      this.eventBus.off(
        DecisionEventType.TRIP_STATE_CHANGED,
        this.tripStateListener as EventListener,
      );
    }
  }

  private async handleTripStateChanged(event: TripStateChangedEvent): Promise<void> {
    if (event.newStatus === 'PLANNING') {
      await this.handlePlanningEntered(event);
      return;
    }
    if (event.newStatus === 'COMPLETED') {
      await this.handleTripCompleted(event);
    }
  }

  private async handlePlanningEntered(event: TripStateChangedEvent): Promise<void> {
    if (!isLoopAutoTriggerEnabled()) return;
    if (!this.loopTrigger) return;
    if (!loopAutoTriggerOnPlanning()) return;

    try {
      const outcome = await this.loopTrigger.triggerReadinessRepair({
        tripId: event.tripId,
        triggerType: 'LIFECYCLE_PLANNING',
        triggerEventId: event.requestId,
        userId: event.userId,
        forceRefreshEvidence: true,
      });
      if (outcome.action === 'skipped') {
        this.logger.debug(
          `[LoopTrigger] Skipped auto-trigger for trip ${event.tripId}: ${outcome.reason}`,
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[LoopTrigger] Auto-trigger failed for trip ${event.tripId}: ${message}`);
    }
  }

  private async handleTripCompleted(event: TripStateChangedEvent): Promise<void> {
    if (!isTripCompletedLearningEnabled()) return;
    if (!this.loopLearningBridge) return;

    try {
      await this.loopLearningBridge.notifyTripCompleted({
        tripId: event.tripId,
        userId: event.userId,
      });
      this.logger.log(`[LoopLearning] Trip completed learning sweep for ${event.tripId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[LoopLearning] Trip completed sweep failed for ${event.tripId}: ${message}`);
    }
  }
}
