// src/trips/decision/__tests__/constraint-checker.spec.ts

/**
 * 约束校验器单元测试
 */

import { ConstraintChecker } from '../constraints/constraint-checker';
import { TripWorldState, ActivityCandidate, ISODate } from '../world-model';
import { TripPlan, PlanDay, PlanSlot } from '../plan-model';
import { ReadinessCheckResult } from '../../readiness/types/readiness-findings.types';

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

    it('should include readiness violations when readiness result exists', () => {
      // 创建 mock readiness result
      const readinessResult: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'NO-TROMSO',
            packId: 'pack.no.norway',
            packVersion: '1.0.0',
            blockers: [],
            must: [
              {
                id: 'rule.norway.ferry_dependent',
                category: 'logistics',
                severity: 'high',
                level: 'must',
                message: '行程依赖渡轮。必须提前查询渡轮时刻表。',
                tasks: [
                  {
                    title: '查询渡轮时刻表',
                    dueOffsetDays: -14,
                    tags: ['transport'],
                  },
                ],
              },
            ],
            should: [
              {
                id: 'rule.norway.winter_mountain_pass',
                category: 'safety_hazards',
                severity: 'medium',
                level: 'should',
                message: '冬季自驾经过山口。建议准备防滑链。',
              },
            ],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 0,
          totalMust: 1,
          totalShould: 1,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      // 将 readiness result 添加到 state
      (mockState as any).readinessResult = readinessResult;

      const result = checker.checkPlan(mockState, mockPlan);

      // 应该包含 readiness violations
      const readinessViolations = result.violations.filter(
        v => v.code.startsWith('READINESS_')
      );

      expect(readinessViolations.length).toBeGreaterThan(0);
      
      // 检查 must 事项被标记为 error
      const mustViolations = readinessViolations.filter(
        v => v.severity === 'error'
      );
      expect(mustViolations.length).toBeGreaterThan(0);
      expect(mustViolations[0].message).toContain('渡轮');

      // 检查 should 事项被标记为 warning
      const shouldViolations = readinessViolations.filter(
        v => v.severity === 'warning'
      );
      expect(shouldViolations.length).toBeGreaterThan(0);
      expect(shouldViolations[0].message).toContain('防滑链');
    });

    it('should handle readiness blockers as errors', () => {
      const readinessResult: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'NO-TROMSO',
            packId: 'pack.no.norway',
            packVersion: '1.0.0',
            blockers: [
              {
                id: 'rule.blocker.visa',
                category: 'entry_transit',
                severity: 'high',
                level: 'blocker',
                message: '缺少必要签证，无法入境。',
              },
            ],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 1,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      (mockState as any).readinessResult = readinessResult;

      const result = checker.checkPlan(mockState, mockPlan);

      // Blockers 应该导致计划无效
      expect(result.isValid).toBe(false);
      
      const blockerViolations = result.violations.filter(
        v => v.code.startsWith('READINESS_') && v.severity === 'error'
      );
      expect(blockerViolations.length).toBeGreaterThan(0);
      expect(blockerViolations[0].message).toContain('签证');
    });

    it('should not include readiness violations when readiness result is missing', () => {
      // 不设置 readinessResult
      const result = checker.checkPlan(mockState, mockPlan);

      const readinessViolations = result.violations.filter(
        v => v.code.startsWith('READINESS_')
      );

      expect(readinessViolations.length).toBe(0);
    });
  });
});

