// src/trips/decision/tot/__tests__/tot-evaluator.spec.ts

/**
 * ToT 评分器单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ToTEvaluatorService } from '../tot-evaluator.service';
import { ThoughtInput } from '../tot-evaluator.interface';
import { TripWorldState, TripContextState, UserPreferenceProfile } from '../../world-model';
import { TripPlan, PlanDay, PlanSlot } from '../../plan-model';

describe('ToTEvaluatorService', () => {
  let service: ToTEvaluatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToTEvaluatorService],
    }).compile();

    service = module.get<ToTEvaluatorService>(ToTEvaluatorService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('硬门控测试', () => {
    it('应该拒绝空计划', async () => {
      const world = createTestWorldState();
      const plan: TripPlan = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-01-01',
            timeSlots: [], // 空计划
          },
        ],
      };

      const node: ThoughtInput = {
        world,
        plan,
      };

      const result = await service.evaluate(node);

      expect(result.allowed).toBe(false);
      expect(result.hardViolations.length).toBeGreaterThan(0);
      expect(result.score).toBe(0);
    });

    it('应该接受有效计划', async () => {
      const world = createTestWorldState();
      const plan: TripPlan = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-01-01',
            timeSlots: [
              {
                id: 'slot1',
                time: '09:00',
                endTime: '10:00',
                title: 'Test Activity',
                type: 'sightseeing',
                poiId: 'poi1',
              },
            ],
          },
        ],
        metrics: {
          estTotalCost: 100,
          estActiveMinutes: 60,
          estTravelMinutes: 30,
          robustnessScore: 0.8,
        },
      };

      const node: ThoughtInput = {
        world,
        plan,
      };

      const result = await service.evaluate(node);

      expect(result.allowed).toBe(true);
      expect(result.hardViolations.length).toBe(0);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('维度评分测试', () => {
    it('应该计算各维度得分', async () => {
      const world = createTestWorldState();
      const plan: TripPlan = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-01-01',
            timeSlots: [
              {
                id: 'slot1',
                time: '09:00',
                endTime: '10:00',
                title: 'Test Activity',
                type: 'sightseeing',
                poiId: 'poi1',
              },
            ],
          },
        ],
        metrics: {
          estTotalCost: 100,
          estActiveMinutes: 60,
          estTravelMinutes: 30,
          robustnessScore: 0.8,
        },
      };

      const node: ThoughtInput = {
        world,
        plan,
      };

      const result = await service.evaluate(node);

      expect(result.allowed).toBe(true);
      expect(result.dims.cost).toBeGreaterThanOrEqual(0);
      expect(result.dims.cost).toBeLessThanOrEqual(1);
      expect(result.dims.risk).toBeGreaterThanOrEqual(0);
      expect(result.dims.risk).toBeLessThanOrEqual(1);
      expect(result.dims.pref).toBeGreaterThanOrEqual(0);
      expect(result.dims.pref).toBeLessThanOrEqual(1);
      expect(result.dims.time).toBeGreaterThanOrEqual(0);
      expect(result.dims.time).toBeLessThanOrEqual(1);
      expect(result.dims.req).toBeGreaterThanOrEqual(0);
      expect(result.dims.req).toBeLessThanOrEqual(1);
    });
  });

  describe('权重计算测试', () => {
    it('应该根据 pacing 调整权重', async () => {
      const worldRelaxed = createTestWorldState('relaxed');
      const worldIntense = createTestWorldState('intense');

      const plan: TripPlan = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-01-01',
            timeSlots: [
              {
                id: 'slot1',
                time: '09:00',
                endTime: '10:00',
                title: 'Test Activity',
                type: 'sightseeing',
                poiId: 'poi1',
              },
            ],
          },
        ],
        metrics: {
          estTotalCost: 100,
          estActiveMinutes: 60,
          estTravelMinutes: 30,
          robustnessScore: 0.8,
        },
      };

      const resultRelaxed = await service.evaluate({ world: worldRelaxed, plan });
      const resultIntense = await service.evaluate({ world: worldIntense, plan });

      // relaxed 应该更重视 pref 和 risk
      expect(resultRelaxed.weights.pref).toBeGreaterThanOrEqual(resultIntense.weights.pref);
      expect(resultRelaxed.weights.risk).toBeGreaterThanOrEqual(resultIntense.weights.risk);
      
      // intense 应该更重视 time
      expect(resultIntense.weights.time).toBeGreaterThanOrEqual(resultRelaxed.weights.time);
    });
  });

  // Helper functions
  function createTestWorldState(
    pace: 'relaxed' | 'moderate' | 'intense' = 'moderate'
  ): TripWorldState {
    const preferences: UserPreferenceProfile = {
      intents: {
        nature: 0.8,
        culture: 0.4,
      },
      pace,
      riskTolerance: 'medium',
      maxDailyActiveMinutes: 480,
    };

    const context: TripContextState = {
      destination: 'Iceland',
      startDate: '2026-01-01',
      durationDays: 7,
      budget: {
        amount: 2000,
        currency: 'USD',
        style: 'medium',
      },
      preferences,
    };

    return {
      context,
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
      },
      policies: {
        dayStart: '08:00',
        dayEnd: '22:00',
        bufferMinBetweenActivities: 10,
      },
    };
  }
});

