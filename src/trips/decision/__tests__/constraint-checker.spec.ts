// src/trips/decision/__tests__/constraint-checker.spec.ts

/**
 * 约束校验器单元测试
 */

import { ConstraintChecker } from '../constraints/constraint-checker';
import { TripWorldState, ActivityCandidate, ISODate } from '../world-model';
import { TripPlan, PlanDay, PlanSlot } from '../plan-model';

describe('ConstraintChecker', () => {
  let checker: ConstraintChecker;
  let mockState: TripWorldState;
  let mockPlan: TripPlan;

  beforeEach(() => {
    checker = new ConstraintChecker();

    mockState = {
      context: {
        destination: 'IS',
        startDate: '2026-01-02' as ISODate,
        durationDays: 1,
        preferences: {
          intents: { nature: 0.8 },
          pace: 'moderate',
          riskTolerance: 'medium',
        },
        budget: {
          amount: 10000,
          currency: 'CNY',
        },
      },
      candidatesByDate: {
        '2026-01-02': [],
      },
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
    };

    mockPlan = {
      version: 'planner-0.1',
      createdAt: new Date().toISOString(),
      days: [],
    };
  });

  describe('checkPlan', () => {
    it('should return valid result for empty plan', () => {
      const result = checker.checkPlan(mockState, mockPlan);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect time window violations', () => {
      const candidate: ActivityCandidate = {
        id: 'poi1',
        name: { en: 'Test POI' },
        type: 'sightseeing',
        durationMin: 60,
        openingHours: [
          {
            date: '2026-01-02',
            windows: [{ start: '10:00', end: '18:00' }],
          },
        ],
      };

      mockState.candidatesByDate['2026-01-02'] = [candidate];

      const slot: PlanSlot = {
        id: 'slot1',
        time: '08:00', // 早于开放时间
        endTime: '09:00',
        title: 'Test POI',
        type: 'sightseeing',
        poiId: 'poi1',
      };

      mockPlan.days = [
        {
          day: 1,
          date: '2026-01-02',
          timeSlots: [slot],
        },
      ];

      const result = checker.checkPlan(mockState, mockPlan);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(
        result.violations.some(v => v.code === 'TIME_WINDOW_VIOLATION')
      ).toBe(true);
    });

    it('should detect budget overrun', () => {
      const candidate: ActivityCandidate = {
        id: 'poi1',
        name: { en: 'Expensive POI' },
        type: 'sightseeing',
        durationMin: 60,
        cost: {
          amount: 15000, // 超过日预算
          currency: 'CNY',
        },
      };

      mockState.candidatesByDate['2026-01-02'] = [candidate];

      const slot: PlanSlot = {
        id: 'slot1',
        time: '10:00',
        endTime: '11:00',
        title: 'Expensive POI',
        type: 'sightseeing',
        poiId: 'poi1',
      };

      mockPlan.days = [
        {
          day: 1,
          date: '2026-01-02',
          timeSlots: [slot],
        },
      ];

      const result = checker.checkPlan(mockState, mockPlan);

      expect(
        result.violations.some(v => v.code === 'BUDGET_DAILY_OVERRUN')
      ).toBe(true);
    });

    it('should detect weather violations for outdoor activities', () => {
      const candidate: ActivityCandidate = {
        id: 'poi1',
        name: { en: 'Outdoor Activity' },
        type: 'nature',
        durationMin: 120,
        indoorOutdoor: 'outdoor',
        weatherSensitivity: 3,
      };

      mockState.candidatesByDate['2026-01-02'] = [candidate];
      mockState.signals.alerts = [
        {
          code: 'WEATHER_ALERT',
          severity: 'critical',
          message: 'Heavy rain expected',
        },
      ];

      const slot: PlanSlot = {
        id: 'slot1',
        time: '10:00',
        endTime: '12:00',
        title: 'Outdoor Activity',
        type: 'nature',
        poiId: 'poi1',
      };

      mockPlan.days = [
        {
          day: 1,
          date: '2026-01-02',
          timeSlots: [slot],
        },
      ];

      const result = checker.checkPlan(mockState, mockPlan);

      expect(
        result.violations.some(v => v.code === 'WEATHER_UNSAFE')
      ).toBe(true);
    });
  });
});

