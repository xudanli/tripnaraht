import { Injectable } from '@nestjs/common';
import { LoopTriggerService } from './loop-trigger.service';
import type { LoopTriggerType } from '../events/loop-travel-event.types';

/** Bridge for other modules (e.g. feasibility-report) to notify loop triggers without circular HTTP. */
@Injectable()
export class LoopTriggerBridgeService {
  constructor(private readonly trigger: LoopTriggerService) {}

  async notifyItineraryChanged(input: {
    tripId: string;
    userId?: string;
    source?: string;
    issueId?: string;
  }): Promise<void> {
    await this.trigger.triggerReadinessRepair({
      tripId: input.tripId,
      triggerType: 'ITINERARY_CHANGED',
      externalEventId: input.issueId ?? input.source ?? 'itinerary_changed',
      userId: input.userId,
      forceRefreshEvidence: false,
      allowInternal: true,
    });
  }

  async notifyConstraintChanged(input: {
    tripId: string;
    userId?: string;
    constraintKey?: string;
  }): Promise<void> {
    await this.trigger.triggerReadinessRepair({
      tripId: input.tripId,
      triggerType: 'CONSTRAINT_CHANGED',
      externalEventId: input.constraintKey ?? 'constraint_changed',
      userId: input.userId,
    });
  }

  async notifyManual(input: {
    tripId: string;
    userId?: string;
    triggerType?: LoopTriggerType;
  }) {
    return this.trigger.triggerReadinessRepair({
      tripId: input.tripId,
      triggerType: input.triggerType ?? 'MANUAL',
      userId: input.userId,
      force: true,
    });
  }

  async notifyEnvironmentDetected(input: {
    tripId: string;
    environmentEventId: string;
    userId?: string;
    eventType?: string;
  }): Promise<void> {
    const triggerType =
      input.eventType === 'weather'
        ? 'WEATHER_ALERT'
        : input.eventType === 'traffic'
          ? 'ROAD_CLOSED'
          : 'ENVIRONMENT_DETECTED';

    await this.trigger.triggerInTripRecovery({
      tripId: input.tripId,
      userId: input.userId ?? 'system',
      triggerType,
      environmentEventId: input.environmentEventId,
      externalEventId: input.environmentEventId,
      allowInternal: true,
    });
  }

  async notifyLateDeparture(input: {
    tripId: string;
    userId: string;
    delayMinutes: number;
  }): Promise<void> {
    if (input.delayMinutes < 15) return;
    await this.trigger.triggerInTripRecovery({
      tripId: input.tripId,
      userId: input.userId,
      triggerType: 'LATE_DEPARTURE',
      externalEventId: `late-${input.delayMinutes}`,
      allowInternal: true,
    });
  }
}
