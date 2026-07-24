/**
 * In-process ring buffer + structured log for ETA reconciliation events.
 * Persistence to warehouse can subscribe to the same event shape later.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  attachActualDuration,
  buildPlanningReconciliationEvent,
  computeReconciliationMetrics,
  type TravelEtaReconciliationEventV1,
  type TravelEtaReconciliationMetricsV1,
} from '../contracts/travel-eta-reconciliation.contract';
import type { TravelEtaEnvelopeV1 } from '../contracts/travel-eta.contract';

const MAX_EVENTS = 2_000;

@Injectable()
export class TravelEtaReconciliationService {
  private readonly logger = new Logger(TravelEtaReconciliationService.name);
  private readonly events: TravelEtaReconciliationEventV1[] = [];

  recordPlanningPrediction(input: {
    eta: TravelEtaEnvelopeV1;
    tripId?: string;
    fromItemId?: string;
    toItemId?: string;
    decision?: string;
  }): TravelEtaReconciliationEventV1 {
    const event = buildPlanningReconciliationEvent(input);
    this.push(event);
    this.logger.log(
      JSON.stringify({
        type: 'travel_eta_reconciliation',
        ...event,
      }),
    );
    return event;
  }

  recordActual(input: {
    /** Match prior planning event */
    tripId?: string;
    segmentKey?: string;
    fromItemId?: string;
    toItemId?: string;
    actualDurationMin: number;
    /** If no prior event, seed from this eta */
    eta?: TravelEtaEnvelopeV1;
    decision?: string;
    sampleQuality?: import('../contracts/travel-eta-actual.contract').TravelEtaSampleQuality;
  }): TravelEtaReconciliationEventV1 {
    const key =
      input.segmentKey ??
      (input.fromItemId && input.toItemId
        ? `${input.fromItemId}->${input.toItemId}`
        : undefined);

    let prior = [...this.events]
      .reverse()
      .find(
        (e) =>
          e.phase !== 'ACTUAL' &&
          (key ? e.segmentKey === key : true) &&
          (input.tripId ? e.tripId === input.tripId : true),
      );

    if (!prior && input.eta) {
      prior = buildPlanningReconciliationEvent({
        eta: input.eta,
        tripId: input.tripId,
        fromItemId: input.fromItemId,
        toItemId: input.toItemId,
        decision: input.decision,
      });
    }

    if (!prior) {
      throw new Error('No planning reconciliation event to attach actualDurationMin');
    }

    const actual = attachActualDuration(prior, input.actualDurationMin, {
      sampleQuality: input.sampleQuality,
    });
    this.push(actual);
    this.logger.log(
      JSON.stringify({
        type: 'travel_eta_reconciliation',
        ...actual,
      }),
    );
    return actual;
  }

  listEvents(limit = 100): TravelEtaReconciliationEventV1[] {
    return this.events.slice(-limit);
  }

  metrics(opts?: {
    demAttachedCount?: number;
    demExpectedCount?: number;
  }): TravelEtaReconciliationMetricsV1 {
    return computeReconciliationMetrics(this.events, opts);
  }

  /** Test seam */
  clear(): void {
    this.events.length = 0;
  }

  private push(event: TravelEtaReconciliationEventV1): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }
}
