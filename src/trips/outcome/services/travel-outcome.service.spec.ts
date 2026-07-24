/**
 * Travel Outcome Service Tests
 *
 * Tests for the travel outcome calculation service.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TravelOutcomeService } from '../services/travel-outcome.service';
import {
  OutcomeCalculationRequest,
  TripSuccessLevel,
  BudgetPerformance,
  CompletionRate,
  OutcomeFactorType,
} from '../types/travel-outcome.types';

describe('TravelOutcomeService', () => {
  let service: TravelOutcomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TravelOutcomeService],
    }).compile();

    service = module.get<TravelOutcomeService>(TravelOutcomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculate', () => {
    it('should calculate outcome for a successful trip', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-123',
        tripData: {
          status: 'COMPLETED',
          destination: 'Iceland',
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-10'),
          plannedBudget: 5000,
          actualSpent: 4200, // 16% under budget
          memberCount: 2,
          plannedActivities: 20,
          completedActivities: 20,
        },
        userFeedback: {
          overallSatisfaction: 9,
          budgetSatisfaction: 8,
          activitySatisfaction: 9,
          wouldRecommend: true,
          wouldRepeat: true,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.success).toBe(TripSuccessLevel.EXCELLENT);
      expect(result.outcome.satisfaction).toBe(9);
      expect(result.outcome.budgetPerformance).toBe(BudgetPerformance.UNDER_BUDGET);
      expect(result.outcome.completionRate).toBe(CompletionRate.FULL);
      expect(result.outcome.completionPercentage).toBe(100);
      expect(result.outcome.overallScore).toBeGreaterThan(0.8);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should calculate outcome for a trip with budget overage', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-456',
        tripData: {
          status: 'COMPLETED',
          destination: 'Japan',
          startDate: new Date('2024-07-01'),
          endDate: new Date('2024-07-15'),
          plannedBudget: 3000,
          actualSpent: 3800, // 26% over budget
          memberCount: 3,
          plannedActivities: 15,
          completedActivities: 14,
        },
        userFeedback: {
          overallSatisfaction: 6,
          budgetSatisfaction: 4,
          activitySatisfaction: 7,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.budgetPerformance).toBe(BudgetPerformance.SIGNIFICANTLY_OVER);
      expect(result.outcome.budgetDeviation).toBeGreaterThan(20);
      expect(result.outcome.completionRate).toBe(CompletionRate.HIGH);
      expect(result.outcome.factors).toBeDefined();
      expect(result.outcome.factors?.some(f => f.type === OutcomeFactorType.BUDGET)).toBe(true);
    });

    it('should calculate outcome for a trip with low completion', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-789',
        tripData: {
          status: 'COMPLETED',
          destination: 'France',
          startDate: new Date('2024-08-01'),
          endDate: new Date('2024-08-07'),
          plannedBudget: 4000,
          actualSpent: 3500,
          memberCount: 2,
          plannedActivities: 25,
          completedActivities: 12, // Only 48% completed
        },
        userFeedback: {
          overallSatisfaction: 5,
          activitySatisfaction: 4,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.completionRate).toBe(CompletionRate.LOW);
      expect(result.outcome.completionPercentage).toBeLessThan(50);
      expect(result.outcome.success).toBe(TripSuccessLevel.ACCEPTABLE);
      expect(result.outcome.factors?.some(f => f.type === OutcomeFactorType.EXECUTION)).toBe(true);
    });

    it('should calculate outcome with weather disruptions from events', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-999',
        tripData: {
          status: 'COMPLETED',
          destination: 'Iceland',
          startDate: new Date('2024-09-01'),
          endDate: new Date('2024-09-10'),
          plannedBudget: 6000,
          actualSpent: 6200,
          memberCount: 2,
          plannedActivities: 18,
          completedActivities: 16,
        },
        events: [
          {
            eventType: 'trip.decision.route_adjusted',
            timestamp: new Date('2024-09-03'),
            payload: { reason: 'Severe weather' },
            attribution: {
              causeType: 'external_factor',
              signals: ['weather', 'safety'],
            },
          },
          {
            eventType: 'trip.action.delayed',
            timestamp: new Date('2024-09-05'),
            payload: { reason: 'Weather delay' },
            attribution: {
              causeType: 'external_factor',
              signals: ['weather'],
            },
          },
        ],
      };

      const result = await service.calculate(request);

      expect(result.outcome.metrics?.weatherDisruptions).toBeGreaterThan(0);
      expect(result.outcome.factors?.some(f => f.type === OutcomeFactorType.WEATHER)).toBe(true);
      expect(result.outcome.recommendations).toContain('Consider weather contingency planning for future trips');
    });

    it('should calculate outcome with transport issues', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-111',
        tripData: {
          status: 'COMPLETED',
          destination: 'Italy',
          startDate: new Date('2024-10-01'),
          endDate: new Date('2024-10-08'),
          plannedBudget: 4500,
          actualSpent: 4600,
          memberCount: 2,
          plannedActivities: 15,
          completedActivities: 14,
        },
        events: [
          {
            eventType: 'trip.decision.route_adjusted',
            timestamp: new Date('2024-10-02'),
            payload: { reason: 'Train strike' },
            attribution: {
              causeType: 'external_factor',
              signals: ['transport'],
            },
          },
          {
            eventType: 'trip.action.delayed',
            timestamp: new Date('2024-10-04'),
            payload: { reason: 'Flight delay' },
            attribution: {
              causeType: 'external_factor',
              signals: ['transport'],
            },
          },
        ],
      };

      const result = await service.calculate(request);

      expect(result.outcome.metrics?.transportIssues).toBeGreaterThan(0);
      expect(result.outcome.factors?.some(f => f.type === OutcomeFactorType.TRANSPORT)).toBe(true);
      expect(result.outcome.recommendations).toBeDefined();
      expect(result.outcome.recommendations?.length).toBeGreaterThan(0);
    });

    it('should handle missing data gracefully', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-222',
        tripData: {
          status: 'COMPLETED',
          destination: 'Spain',
          startDate: new Date('2024-11-01'),
          endDate: new Date('2024-11-05'),
          plannedBudget: 3000,
          memberCount: 2,
          // Missing actualSpent, plannedActivities, completedActivities
        },
        // No user feedback, no events
      };

      const result = await service.calculate(request);

      expect(result.outcome).toBeDefined();
      expect(result.dataQuality).toBeLessThan(1.0);
      expect(result.missingData.length).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThan(1.0);
      // Should still calculate with defaults
      expect(result.outcome.success).toBeDefined();
      expect(result.outcome.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should generate appropriate recommendations', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-444',
        tripData: {
          status: 'COMPLETED',
          destination: 'Thailand',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-10'),
          plannedBudget: 2000,
          actualSpent: 2800, // 40% over budget
          memberCount: 2,
          plannedActivities: 30,
          completedActivities: 20, // Only 67% completed
        },
        userFeedback: {
          overallSatisfaction: 5,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.recommendations).toBeDefined();
      expect(result.outcome.recommendations?.length).toBeGreaterThan(0);
      expect(result.outcome.recommendations).toContain('Consider increasing budget allocation or finding cost-saving alternatives');
      expect(result.outcome.recommendations).toContain('Review activity planning to ensure realistic schedules');
    });

    it('should calculate overall score correctly', async () => {
      const request: OutcomeCalculationRequest = {
        tripId: 'trip-555',
        tripData: {
          status: 'COMPLETED',
          destination: 'Norway',
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-08'),
          plannedBudget: 5000,
          actualSpent: 4900,
          memberCount: 2,
          plannedActivities: 15,
          completedActivities: 15,
        },
        userFeedback: {
          overallSatisfaction: 8,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.overallScore).toBeGreaterThan(0.7);
      expect(result.outcome.overallScore).toBeLessThanOrEqual(1.0);
    });
  });

  describe('calculateBatch', () => {
    it('should calculate outcomes for multiple trips', async () => {
      const requests: OutcomeCalculationRequest[] = [
        {
          tripId: 'trip-1',
          tripData: {
            status: 'COMPLETED',
            destination: 'Iceland',
            startDate: new Date('2024-01-01'),
            endDate: new Date('2024-01-10'),
            plannedBudget: 5000,
            actualSpent: 4800,
            memberCount: 2,
            plannedActivities: 20,
            completedActivities: 20,
          },
          userFeedback: { overallSatisfaction: 9 },
        },
        {
          tripId: 'trip-2',
          tripData: {
            status: 'COMPLETED',
            destination: 'Japan',
            startDate: new Date('2024-02-01'),
            endDate: new Date('2024-02-15'),
            plannedBudget: 3000,
            actualSpent: 3800,
            memberCount: 3,
            plannedActivities: 15,
            completedActivities: 14,
          },
          userFeedback: { overallSatisfaction: 6 },
        },
      ];

      const results = await service.calculateBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].outcome.tripId).toBe('trip-1');
      expect(results[1].outcome.tripId).toBe('trip-2');
      expect(results[0].outcome.success).toBe(TripSuccessLevel.EXCELLENT);
      expect(results[1].outcome.budgetPerformance).toBe(BudgetPerformance.SIGNIFICANTLY_OVER);
    });
  });
});
