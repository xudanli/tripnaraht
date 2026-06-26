/**
 * Attribution Enrichment Service
 *
 * Integrates Decision Attribution into the event emission pipeline.
 * Automatically enriches travel events with attribution data.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { DecisionAttributionService } from './decision-attribution.service';
import {
  AttributionRequest,
  AttributionContext,
} from '../types/decision-attribution.types';
import {
  TravelEventEnvelope,
  TravelEventAttribution,
} from '../../event-store/types/travel-event.types';

/**
 * Attribution enrichment options.
 */
export interface AttributionEnrichmentOptions {
  /** Whether to enable attribution enrichment */
  enabled?: boolean;

  /** Whether to fail if attribution fails */
  failOnError?: boolean;

  /** Whether to enrich asynchronously */
  async?: boolean;
}

/**
 * Service for enriching travel events with attribution data.
 */
@Injectable()
export class AttributionEnrichmentService {
  private readonly logger = new Logger(AttributionEnrichmentService.name);

  constructor(
    @Optional() private readonly attributionService?: DecisionAttributionService,
  ) {}

  /**
   * Enrich a travel event envelope with attribution data.
   *
   * @param event - The travel event to enrich
   * @param context - Attribution context (trip state, user profile, evidence, risks)
   * @param options - Enrichment options
   * @returns The enriched event (or original if attribution fails)
   */
  async enrichEvent(
    event: TravelEventEnvelope,
    context?: AttributionContext,
    options: AttributionEnrichmentOptions = {},
  ): Promise<TravelEventEnvelope> {
    const { enabled = true, failOnError = false, async = false } = options;

    // Skip if attribution is disabled or service is not available
    if (!enabled || !this.attributionService) {
      this.logger.debug('Attribution enrichment disabled or service unavailable');
      return event;
    }

    // Skip if event already has attribution
    if (event.attribution) {
      this.logger.debug(`Event ${event.eventId} already has attribution, skipping`);
      return event;
    }

    try {
      if (async) {
        // Enrich asynchronously (fire and forget)
        this.enrichEventAsync(event, context).catch((error) => {
          this.logger.error(`Async attribution enrichment failed: ${error}`);
        });
        return event;
      }

      // Enrich synchronously
      const attribution = await this.computeAttribution(event, context);
      return {
        ...event,
        attribution,
      };
    } catch (error) {
      this.logger.error(
        `Attribution enrichment failed for event ${event.eventId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (failOnError) {
        throw error;
      }

      // Return original event if enrichment fails
      return event;
    }
  }

  /**
   * Enrich multiple events in batch.
   */
  async enrichEventsBatch(
    events: TravelEventEnvelope[],
    context?: AttributionContext,
    options: AttributionEnrichmentOptions = {},
  ): Promise<TravelEventEnvelope[]> {
    const { enabled = true, failOnError = false } = options;

    if (!enabled || !this.attributionService) {
      return events;
    }

    try {
      // Build attribution requests
      const requests = events
        .filter((event) => !event.attribution)
        .map((event) => this.buildAttributionRequest(event, context));

      // Analyze in batch
      const results = await this.attributionService.analyzeBatch(requests);

      // Create a map of eventId to attribution
      const attributionMap = new Map<string, TravelEventAttribution>();
      results.forEach((result, index) => {
        const eventId = requests[index].eventId;
        attributionMap.set(eventId, this.toTravelEventAttribution(result.attribution));
      });

      // Enrich events
      return events.map((event) => {
        if (event.attribution) {
          return event; // Already has attribution
        }
        const attribution = attributionMap.get(event.eventId);
        if (attribution) {
          return { ...event, attribution };
        }
        return event;
      });
    } catch (error) {
      this.logger.error(`Batch attribution enrichment failed: ${error}`);
      if (failOnError) {
        throw error;
      }
      return events;
    }
  }

  /**
   * Compute attribution for a single event.
   */
  private async computeAttribution(
    event: TravelEventEnvelope,
    context?: AttributionContext,
  ): Promise<TravelEventAttribution> {
    const request = this.buildAttributionRequest(event, context);
    const result = await this.attributionService!.analyze(request);
    return this.toTravelEventAttribution(result.attribution);
  }

  /**
   * Build attribution request from travel event.
   */
  private buildAttributionRequest(
    event: TravelEventEnvelope,
    context?: AttributionContext,
  ): AttributionRequest {
    return {
      tripId: event.tripId,
      eventId: event.eventId,
      eventType: event.eventType,
      payload: event.payload,
      source: event.source,
      context,
    };
  }

  /**
   * Convert DecisionAttribution to TravelEventAttribution (lightweight version).
   */
  private toTravelEventAttribution(
    attribution: import('../types/decision-attribution.types').DecisionAttribution,
  ): TravelEventAttribution {
    return {
      causeType: attribution.causeType,
      signals: attribution.signals,
      influenceScore: attribution.influenceScore,
      confidence: attribution.confidence,
      explanation: attribution.explanation,
      computedAt: attribution.computedAt,
    };
  }

  /**
   * Enrich event asynchronously (fire and forget).
   */
  private async enrichEventAsync(
    event: TravelEventEnvelope,
    context?: AttributionContext,
  ): Promise<void> {
    try {
      const attribution = await this.computeAttribution(event, context);
      this.logger.debug(
        `Async attribution computed for event ${event.eventId}: ${attribution.causeType}`,
      );
      // In a real implementation, you might want to update the persisted event
      // or emit an attribution-completed event
    } catch (error) {
      this.logger.error(`Async attribution failed: ${error}`);
    }
  }

  /**
   * Build attribution context from trip data.
   * This is a helper to build context from existing trip/state data.
   */
  buildAttributionContext(data: {
    tripState?: {
      status: string;
      destination?: string;
      budget?: number;
      startDate?: string;
      endDate?: string;
      memberCount?: number;
    };
    userProfile?: {
      userId: string;
      preferences?: Record<string, unknown>;
      history?: {
        pastDestinations?: string[];
        pastBudgets?: number[];
        decisionPatterns?: Record<string, number>;
      };
    };
    evidence?: Array<{
      factType: string;
      entityRef: string;
      confidence: number;
    }>;
    risks?: Array<{
      category: string;
      urgency: number;
      entityRef: string;
    }>;
  }): AttributionContext {
    return data as AttributionContext;
  }
}
