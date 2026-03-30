/**
 * ConstraintEngineService 单元测试
 *
 * Phase 1：Top 5 硬约束场景验证
 * - 场景 1: 时间窗违规（POI 营业时间）
 * - 场景 2: 连通性不足（旅行时间不足）
 * - 场景 3: 预算超支
 * - 场景 4: 体力超限
 * - 场景 5: 天气/路况风险
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEngineService } from './constraint-engine.service';
import { ConstraintChecker } from './constraint-checker';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';

// === 测试数据工厂 ===

function createBaseState(): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-06-10',
      durationDays: 3,
      budget: { amount: 3000, currency: 'USD' },
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
        maxDailyActiveMinutes: 360,
      },
    },
    candidatesByDate: {
      '2026-06-10': [],
      '2026-06-11': [],
      '2026-06-12': [],
    },
    signals: {
      lastUpdatedAt: new Date().toISOString(),
    },
    policies: {
      maxBudgetOverrunRatio: 1.05,
    },
  };
}

function createBasePlan(): TripPlan {
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-10',
        timeSlots: [],
      },
    ],
  };
}

describe('ConstraintEngineService', () => {
  let service: ConstraintEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConstraintEngineService, ConstraintChecker],
    }).compile();

    service = module.get<ConstraintEngineService>(ConstraintEngineService);
  });

  describe('无 ConstraintChecker 时', () => {
    it('应降级为 feasible: true', async () => {
      const moduleWithoutChecker = await Test.createTestingModule({
        providers: [ConstraintEngineService],
      }).compile();

      const serviceNoChecker = moduleWithoutChecker.get(ConstraintEngineService);
      const state = createBaseState();
      const plan = createBasePlan();

      const result = await serviceNoChecker.isFeasible(state, plan);

      expect(result.feasible).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('场景 1: 时间窗违规（POI 营业时间）', () => {
    it('活动不在开放时间窗内时应标记为 infeasible', async () => {
      const state = createBaseState();
      state.candidatesByDate['2026-06-10'] = [
        {
          id: 'poi-1',
          name: { en: 'Blue Lagoon' },
          type: 'sightseeing',
          durationMin: 120,
          openingHours: [
            {
              date: '2026-06-10',
              windows: [{ start: '09:00', end: '18:00' }],
            },
          ],
        },
      ];

      const plan = createBasePlan();
      plan.days[0].timeSlots = [
        {
          id: 's1',
          time: '07:00', // 早于 09:00 开放
          endTime: '09:00',
          title: 'Blue Lagoon',
          type: 'sightseeing',
          poiId: 'poi-1',
        },
      ];

      const result = await service.isFeasible(state, plan);

      expect(result.feasible).toBe(false);
      expect(result.violations.some(v => v.code === 'TIME_WINDOW_VIOLATION')).toBe(true);
      expect(result.infeasibilityExplanation?.reasons.some(r => r.constraint === 'time_window')).toBe(true);
    });
  });

  describe('场景 2: 连通性不足（旅行时间不足）', () => {
    it('活动间旅行时间不足时应标记为 infeasible', async () => {
      const state = createBaseState();
      state.candidatesByDate['2026-06-10'] = [
        { id: 'poi-a', name: { en: 'A' }, type: 'sightseeing', durationMin: 60 },
        { id: 'poi-b', name: { en: 'B' }, type: 'sightseeing', durationMin: 60 },
      ];

      const plan = createBasePlan();
      plan.days[0].timeSlots = [
        {
          id: 's1',
          time: '09:00',
          endTime: '10:00',
          title: 'A',
          type: 'sightseeing',
          poiId: 'poi-a',
          coordinates: { lat: 64, lng: -22 },
        },
        {
          id: 's2',
          time: '10:05', // 仅 5 分钟，但需要 90 分钟
          endTime: '11:05',
          title: 'B',
          type: 'sightseeing',
          poiId: 'poi-b',
          coordinates: { lat: 65, lng: -21 },
          travelLegFromPrev: {
            mode: 'drive',
            from: { lat: 64, lng: -22 },
            to: { lat: 65, lng: -21 },
            durationMin: 90,
          },
        },
      ];

      const result = await service.isFeasible(state, plan);

      expect(result.feasible).toBe(false);
      expect(result.violations.some(v => v.code === 'CONNECTIVITY_INSUFFICIENT_TIME')).toBe(true);
      expect(result.infeasibilityExplanation?.reasons.some(r => r.constraint === 'connectivity')).toBe(true);
    });
  });

  describe('场景 3: 预算超支', () => {
    it('总预算超支时应标记为 infeasible', async () => {
      const state = createBaseState();
      state.context.budget = { amount: 1000, currency: 'USD' };
      state.candidatesByDate['2026-06-10'] = [
        { id: 'poi-1', name: { en: 'Expensive' }, type: 'sightseeing', durationMin: 60, cost: { amount: 800, currency: 'USD' } },
        { id: 'poi-2', name: { en: 'Also expensive' }, type: 'sightseeing', durationMin: 60, cost: { amount: 600, currency: 'USD' } },
      ];

      const plan = createBasePlan();
      plan.metrics = { estTotalCost: 5000 };
      plan.days[0].timeSlots = [
        { id: 's1', time: '09:00', endTime: '10:00', title: 'Expensive', type: 'sightseeing', poiId: 'poi-1' },
        { id: 's2', time: '10:30', endTime: '11:30', title: 'Also expensive', type: 'sightseeing', poiId: 'poi-2' },
      ];

      const result = await service.isFeasible(state, plan);

      // 日预算超支 > 1.2 会触发 error
      expect(result.feasible).toBe(false);
      expect(result.violations.some(v => v.code === 'BUDGET_DAILY_OVERRUN' || v.code === 'BUDGET_GLOBAL_OVERRUN')).toBe(true);
    });
  });

  describe('场景 4: 体力超限', () => {
    it('单日活动强度超用户承受时应标记为 warning（软约束）', async () => {
      const state = createBaseState();
      state.context.preferences.maxDailyActiveMinutes = 120; // 很低
      state.candidatesByDate['2026-06-10'] = [
        { id: 'poi-1', name: { en: 'Long hike' }, type: 'nature', durationMin: 240 },
        { id: 'poi-2', name: { en: 'Another activity' }, type: 'sightseeing', durationMin: 120 },
      ];

      const plan = createBasePlan();
      plan.days[0].timeSlots = [
        { id: 's1', time: '09:00', endTime: '13:00', title: 'Long hike', type: 'nature', poiId: 'poi-1' },
        { id: 's2', time: '14:00', endTime: '16:00', title: 'Another', type: 'sightseeing', poiId: 'poi-2' },
      ];

      const result = await service.isFeasible(state, plan);

      // PHYSICAL_OVERLOAD 是 warning，不影响 feasible（errorCount）
      // feasible 由 error 级别违规决定
      const hasPhysicalViolation = result.violations.some(v => v.code === 'PHYSICAL_OVERLOAD');
      expect(hasPhysicalViolation).toBe(true);
    });
  });

  describe('场景 5: 天气/路况风险', () => {
    it('户外活动遇恶劣天气时应标记为 infeasible', async () => {
      const state = createBaseState();
      state.signals.weatherByDate = {
        '2026-06-10': { condition: 'storm', precipitationMm: 50 },
      };
      state.signals.alerts = [
        { code: 'WEATHER_STORM', severity: 'critical', message: '暴雨预警' },
      ];
      state.candidatesByDate['2026-06-10'] = [
        {
          id: 'poi-outdoor',
          name: { en: 'Outdoor hike' },
          type: 'nature',
          durationMin: 120,
          indoorOutdoor: 'outdoor',
          weatherSensitivity: 3,
        },
      ];

      const plan = createBasePlan();
      plan.days[0].timeSlots = [
        {
          id: 's1',
          time: '09:00',
          endTime: '11:00',
          title: 'Outdoor hike',
          type: 'nature',
          poiId: 'poi-outdoor',
        },
      ];

      const result = await service.isFeasible(state, plan);

      expect(result.feasible).toBe(false);
      expect(result.violations.some(v => v.code === 'WEATHER_UNSAFE')).toBe(true);
      expect(result.infeasibilityExplanation?.reasons.some(r => r.constraint === 'weather')).toBe(true);
    });
  });

  describe('场景 6: max_daily_drive 超限', () => {
    it('自驾时长超 DSL 限制时应标记为 infeasible', async () => {
      const state = createBaseState();
      (state as any).policies = {
        constraintDSL: {
          hard_constraints: {
            travel_mode: {
              allow_self_drive: true,
              max_daily_drive: { value: 2, unit: 'hour' },
            },
          },
        },
      };
      state.candidatesByDate['2026-06-10'] = [
        { id: 'poi-a', name: { en: 'A' }, type: 'sightseeing', durationMin: 60 },
        { id: 'poi-b', name: { en: 'B' }, type: 'sightseeing', durationMin: 60 },
      ];

      const plan = createBasePlan();
      plan.days[0].timeSlots = [
        {
          id: 's1',
          time: '09:00',
          endTime: '10:00',
          title: 'A',
          type: 'sightseeing',
          poiId: 'poi-a',
          coordinates: { lat: 64, lng: -22 },
        },
        {
          id: 's2',
          time: '13:00',
          endTime: '14:00',
          title: 'B',
          type: 'sightseeing',
          poiId: 'poi-b',
          coordinates: { lat: 65, lng: -21 },
          travelLegFromPrev: {
            mode: 'drive',
            from: { lat: 64, lng: -22 },
            to: { lat: 65, lng: -21 },
            durationMin: 180, // 3h 驾驶
          },
        },
      ];

      const result = await service.isFeasible(state, plan);

      expect(result.feasible).toBe(false);
      expect(result.violations.some(v => v.code === 'MAX_DAILY_DRIVE_EXCEEDED')).toBe(true);
    });
  });

  describe('可行方案', () => {
    it('无违规时应返回 feasible: true', async () => {
      const state = createBaseState();
      state.candidatesByDate['2026-06-10'] = [
        {
          id: 'poi-1',
          name: { en: 'Indoor museum' },
          type: 'museum',
          durationMin: 90,
          indoorOutdoor: 'indoor',
          openingHours: [{ date: '2026-06-10', windows: [{ start: '09:00', end: '18:00' }] }],
          cost: { amount: 20, currency: 'USD' },
        },
      ];

      const plan = createBasePlan();
      plan.metrics = { estTotalCost: 500 };
      plan.days[0].timeSlots = [
        {
          id: 's1',
          time: '10:00',
          endTime: '11:30',
          title: 'Museum',
          type: 'museum',
          poiId: 'poi-1',
        },
      ];

      const result = await service.isFeasible(state, plan);

      expect(result.feasible).toBe(true);
    });
  });

  describe('checkFeasible', () => {
    it('应返回 boolean 结果', async () => {
      const state = createBaseState();
      const plan = createBasePlan();
      const feasible = await service.checkFeasible(state, plan);
      expect(typeof feasible).toBe('boolean');
    });
  });
});
