/**
 * Attribution Enrichment Service Tests
 *
 * Tests for the attribution enrichment integration.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttributionEnrichmentService } from '../services/attribution-enrichment.service';
import { DecisionAttributionService } from '../services/decision-attribution.service';
import {
  TravelEventEnvelope,
  TravelEventSource,
  TrajectorySegment,
} from '../../event-store/types/travel-event.types';
import { AttributionContext } from '../types/decision-attribution.types';

describe('AttributionEnrichmentService', () => {
  let service: AttributionEnrichmentService;
  let attributionService: DecisionAttributionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributionEnrichmentService,
        DecisionAttributionService,
      ],
    }).compile();

    service = module.get<AttributionEnrichmentService>(AttributionEnrichmentService);
    attributionService = module.get<DecisionAttributionService>(DecisionAttributionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enrichEvent', () => {
    it('should enrich event with attribution when enabled', async () => {
      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      const enriched = await service.enrichEvent(event);

      expect(enriched.attribution).toBeDefined();
      expect(enriched.attribution?.causeType).toBeDefined();
      expect(enriched.attribution?.signals).toBeDefined();
      expect(enriched.attribution?.influenceScore).toBeGreaterThan(0);
    });

    it('should skip enrichment when disabled', async () => {
      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      const enriched = await service.enrichEvent(event, undefined, { enabled: false });

      expect(enriched.attribution).toBeUndefined();
    });

    it('should skip enrichment when event already has attribution', async () => {
      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
        attribution: {
          causeType: 'user_action',
          signals: ['budget'],
          influenceScore: 0.9,
          confidence: 'high',
          explanation: 'Pre-existing attribution',
          computedAt: new Date().toISOString(),
        },
      };

      const enriched = await service.enrichEvent(event);

      expect(enriched.attribution).toEqual(event.attribution);
    });

    it('should use context data for enrichment', async () => {
      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      const context: AttributionContext = {
        tripState: {
          status: 'DRAFT',
          destination: 'Iceland',
          budget: 5000,
          memberCount: 2,
        },
        risks: [
          {
            category: 'WEATHER_NATURAL',
            urgency: 4,
            entityRef: 'iceland:region',
          },
        ],
      };

      const enriched = await service.enrichEvent(event, context);

      expect(enriched.attribution).toBeDefined();
      expect(enriched.attribution?.signals).toContain('budget');
      // Context should add risk signal
      expect(enriched.attribution?.signals).toContain('risk');
    });

    it('should return original event when attribution service is not available', async () => {
      const moduleWithoutAttribution: TestingModule = await Test.createTestingModule({
        providers: [AttributionEnrichmentService],
      }).compile();

      const serviceWithoutAttribution = moduleWithoutAttribution.get<AttributionEnrichmentService>(
        AttributionEnrichmentService,
      );

      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      const enriched = await serviceWithoutAttribution.enrichEvent(event);

      expect(enriched.attribution).toBeUndefined();
      expect(enriched).toEqual(event);
    });

    it('should fail gracefully when attribution fails and failOnError is false', async () => {
      const event: TravelEventEnvelope = {
        eventId: 'event-123',
        idempotencyKey: 'key-123',
        tripId: 'trip-123',
        segment: TrajectorySegment.DECISION,
        eventType: 'trip.decision.budget_changed',
        source: TravelEventSource.TRIP_LIFECYCLE,
        schemaVersion: 1,
        payload: {
          budgetChange: 1000,
        },
        timestamp: new Date().toISOString(),
      };

      // This should not throw even if attribution fails
      const enriched = await service.enrichEvent(event, undefined, { failOnError: false });

      // Should return enriched event if attribution succeeds
      expect(enriched).toBeDefined();
    });
  });

  describe('enrichEventsBatch', () => {
    it('should enrich multiple events in batch', async () => {
      const events: TravelEventEnvelope[] = [
        {
          eventId: 'event-1',
          idempotencyKey: 'key-1',
          tripId: 'trip-123',
          segment: TrajectorySegment.DECISION,
          eventType: 'trip.decision.budget_changed',
          source: TravelEventSource.TRIP_LIFECYCLE,
          schemaVersion: 1,
          payload: { budgetChange: 1000 },
          timestamp: new Date().toISOString(),
        },
        {
          eventId: 'event-2',
          idempotencyKey: 'key-2',
          tripId: 'trip-123',
          segment: TrajectorySegment.DECISION,
          eventType: 'trip.decision.destination_changed',
          source: TravelEventSource.TRIP_LIFECYCLE,
          schemaVersion: 1,
          payload: { destination: 'Iceland' },
          timestamp: new Date().toISOString(),
        },
      ];

      const enriched = await service.enrichEventsBatch(events);

      expect(enriched).toHaveLength(2);
      expect(enriched[0].attribution).toBeDefined();
      expect(enriched[1].attribution).toBeDefined();
    });

    it('should skip events that already have attribution in batch', async () => {
      const events: TravelEventEnvelope[] = [
        {
          eventId: 'event-1',
          idempotencyKey: 'key-1',
          tripId: 'trip-123',
          segment: TrajectorySegment.DECISION,
          eventType: 'trip.decision.budget_changed',
          source: TravelEventSource.TRIP_LIFECYCLE,
          schemaVersion: 1,
          payload: { budgetChange: 1000 },
          timestamp: new Date().toISOString(),
          attribution: {
            causeType: 'user_action',
            signals: ['budget'],
            influenceScore: 0.9,
            confidence: 'high',
            explanation: 'Pre-existing',
            computedAt: new Date().toISOString(),
          },
        },
        {
          eventId: 'event-2',
          idempotencyKey: 'key-2',
          tripId: 'trip-123',
          segment: TrajectorySegment.DECISION,
          eventType: 'trip.decision.destination_changed',
          source: TravelEventSource.TRIP_LIFECYCLE,
          schemaVersion: 1,
          payload: { destination: 'Iceland' },
          timestamp: new Date().toISOString(),
        },
      ];

      const enriched = await service.enrichEventsBatch(events);

      expect(enriched[0].attribution?.explanation).toBe('Pre-existing');
      expect(enriched[1].attribution?.explanation).not.toBe('Pre-existing');
    });
  });

  describe('buildAttributionContext', () => {
    it('should build attribution context from trip data', () => {
      const context = service.buildAttributionContext({
        tripState: {
          status: 'DRAFT',
          destination: 'Iceland',
          budget: 5000,
          startDate: '2024-06-01',
          endDate: '2024-06-10',
          memberCount: 2,
        },
        userProfile: {
          userId: 'user-123',
          preferences: {
            adventure: true,
            budget: 'moderate',
          },
        },
        evidence: [
          {
            factType: 'WEATHER',
            entityRef: 'iceland:region',
            confidence: 0.9,
          },
        ],
        risks: [
          {
            category: 'WEATHER_NATURAL',
            urgency: 4,
            entityRef: 'iceland:region',
          },
        ],
      });

      expect(context.tripState).toBeDefined();
      expect(context.tripState?.status).toBe('DRAFT');
      expect(context.userProfile).toBeDefined();
      expect(context.evidence).toHaveLength(1);
      expect(context.risks).toHaveLength(1);
    });
  });
});
