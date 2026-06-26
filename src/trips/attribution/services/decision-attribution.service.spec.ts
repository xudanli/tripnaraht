/**
 * Decision Attribution Service Tests
 *
 * Tests for the decision attribution layer.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionAttributionService } from '../services/decision-attribution.service';
import {
  DecisionCauseType,
  DecisionSignal,
  AttributionConfidence,
  AttributionRequest,
} from '../types/decision-attribution.types';

describe('DecisionAttributionService', () => {
  let service: DecisionAttributionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecisionAttributionService],
    }).compile();

    service = module.get<DecisionAttributionService>(DecisionAttributionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyze', () => {
    it('should attribute budget change events to USER_ACTION with BUDGET signal', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-123',
        eventType: 'trip.decision.budget_changed',
        payload: {
          budgetChange: 1000,
          oldBudget: 5000,
          newBudget: 6000,
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.USER_ACTION);
      expect(result.attribution.signals).toContain(DecisionSignal.BUDGET);
      expect(result.attribution.influenceScore).toBeGreaterThan(0.8);
      expect(result.attribution.confidence).toBe(AttributionConfidence.HIGH);
      expect(result.attribution.explanation).toContain('budget');
    });

    it('should attribute destination change events to USER_ACTION with INTEREST signal', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-456',
        eventType: 'trip.decision.destination_changed',
        payload: {
          destination: 'Iceland',
          oldDestination: 'Japan',
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.USER_ACTION);
      expect(result.attribution.signals).toContain(DecisionSignal.INTEREST);
      expect(result.attribution.signals).toContain(DecisionSignal.BUDGET);
      expect(result.attribution.influenceScore).toBeGreaterThan(0.9);
    });

    it('should attribute transition rejection due to budget to CONSTRAINT', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-789',
        eventType: 'trip.lifecycle.transition_rejected',
        payload: {
          currentStatus: 'DRAFT',
          attemptedStatus: 'RECRUITING',
          reason: 'budget',
          reasonCodes: ['BUDGET'],
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.CONSTRAINT);
      expect(result.attribution.signals).toContain(DecisionSignal.BUDGET);
      expect(result.attribution.influenceScore).toBeGreaterThan(0.8);
    });

    it('should attribute transition rejection due to time to CONSTRAINT', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-999',
        eventType: 'trip.lifecycle.transition_rejected',
        payload: {
          currentStatus: 'DRAFT',
          attemptedStatus: 'RECRUITING',
          reason: 'time',
          reasonCodes: ['TIME'],
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.CONSTRAINT);
      expect(result.attribution.signals).toContain(DecisionSignal.TIME);
    });

    it('should attribute weather disruption to EXTERNAL_FACTOR', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-111',
        eventType: 'trip.decision.route_adjusted',
        payload: {
          reason: 'Severe weather warning',
          riskCategory: 'WEATHER_NATURAL',
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.EXTERNAL_FACTOR);
      expect(result.attribution.signals).toContain(DecisionSignal.WEATHER);
      expect(result.attribution.signals).toContain(DecisionSignal.SAFETY);
      expect(result.attribution.signals).toContain(DecisionSignal.RISK);
    });

    it('should attribute safety alert to EXTERNAL_FACTOR with high priority', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-222',
        eventType: 'trip.decision.route_adjusted', // Changed to match rule
        payload: {
          reason: 'Safety advisory issued',
          riskCategory: 'SAFETY_SECURITY',
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.EXTERNAL_FACTOR);
      expect(result.attribution.signals).toContain(DecisionSignal.SAFETY);
      expect(result.attribution.signals).toContain(DecisionSignal.RISK);
      expect(result.attribution.influenceScore).toBeGreaterThan(0.9);
    });

    it('should attribute AI suggestions to AI_SUGGESTION', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-333',
        eventType: 'trip.decision.destination_suggested',
        payload: {
          suggestedBy: 'ai',
          destination: 'Iceland',
        },
        source: 'decision_os',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.AI_SUGGESTION);
      expect(result.attribution.signals).toContain(DecisionSignal.INTEREST);
      expect(result.attribution.influenceScore).toBeLessThan(0.8); // AI suggestions have lower base score
    });

    it('should use default attribution for unknown event types', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-444',
        eventType: 'unknown.event.type',
        payload: {
          someData: 'value',
        },
        source: 'system',
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.USER_ACTION);
      expect(result.attribution.signals).toContain(DecisionSignal.INTEREST);
      expect(result.attribution.confidence).toBe(AttributionConfidence.LOW);
      // Default attribution uses the default rule which has priority 0
      expect(result.attribution.metadata?.ruleId).toBe('default_user_action');
    });

    it('should enhance attribution with context data', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-555',
        eventType: 'trip.decision.budget_changed',
        payload: {
          budgetChange: 1000,
        },
        source: 'trip.lifecycle',
        context: {
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
        },
      };

      const result = await service.analyze(request);

      expect(result.attribution.causeType).toBe(DecisionCauseType.USER_ACTION);
      expect(result.attribution.signals).toContain(DecisionSignal.BUDGET);
      // Context should add RISK signal due to active risks
      expect(result.attribution.signals).toContain(DecisionSignal.RISK);
      expect(result.attribution.metadata?.context).toBeDefined();
    });

    it('should provide signal scores for debugging', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-666',
        eventType: 'trip.decision.budget_changed',
        payload: {
          budgetChange: 1000,
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.signalScores).toBeDefined();
      expect(result.signalScores![DecisionSignal.BUDGET]).toBeGreaterThan(0);
      // Interest signal might have some score due to normalization, but should be lower than budget
      expect(result.signalScores![DecisionSignal.BUDGET]).toBeGreaterThanOrEqual(
        result.signalScores![DecisionSignal.INTEREST] || 0,
      );
    });

    it('should provide alternative attributions when multiple rules match', async () => {
      const request: AttributionRequest = {
        tripId: 'trip-123',
        eventId: 'event-777',
        eventType: 'trip.decision.destination_changed',
        payload: {
          destination: 'Iceland',
          budgetChange: 1000, // This could also match budget rule
        },
        source: 'trip.lifecycle',
      };

      const result = await service.analyze(request);

      expect(result.attribution).toBeDefined();
      // Primary attribution should be destination (higher priority)
      expect(result.attribution.causeType).toBe(DecisionCauseType.USER_ACTION);
      expect(result.alternatives).toBeDefined();
    });
  });

  describe('analyzeBatch', () => {
    it('should analyze multiple events in batch', async () => {
      const requests: AttributionRequest[] = [
        {
          tripId: 'trip-123',
          eventId: 'event-1',
          eventType: 'trip.decision.budget_changed',
          payload: { budgetChange: 1000 },
          source: 'trip.lifecycle',
        },
        {
          tripId: 'trip-123',
          eventId: 'event-2',
          eventType: 'trip.decision.destination_changed',
          payload: { destination: 'Iceland' },
          source: 'trip.lifecycle',
        },
        {
          tripId: 'trip-123',
          eventId: 'event-3',
          eventType: 'trip.lifecycle.transition_rejected',
          payload: {
            reason: 'budget',
            reasonCodes: ['BUDGET'],
          },
          source: 'trip.lifecycle',
        },
      ];

      const results = await service.analyzeBatch(requests);

      expect(results).toHaveLength(3);
      expect(results[0].attribution.signals).toContain(DecisionSignal.BUDGET);
      expect(results[1].attribution.signals).toContain(DecisionSignal.INTEREST);
      expect(results[2].attribution.causeType).toBe(DecisionCauseType.CONSTRAINT);
    });
  });
});
