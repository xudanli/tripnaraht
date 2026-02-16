/**
 * DailyUtilityCalculatorService 单元测试
 *
 * Phase 2 ExpectedUtility v1 验证
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DailyUtilityCalculatorService } from './daily-utility-calculator.service';
import { FatigueCalculatorService } from '../../services/fatigue-calculator.service';
import { TripPlan, PlanDay } from '../../plan-model';
import { TripWorldState } from '../../world-model';

function createBaseState(): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-06-10',
      durationDays: 3,
      budget: { amount: 3000, currency: 'USD' },
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {
      '2026-06-10': [
        {
          id: 'poi-1',
          name: { en: 'Blue Lagoon' },
          type: 'sightseeing',
          durationMin: 120,
          qualityScore: 0.9,
          mustSee: true,
          cost: { amount: 80, currency: 'USD' },
          indoorOutdoor: 'outdoor',
          riskLevel: 'low',
        },
        {
          id: 'poi-2',
          name: { en: 'Museum' },
          type: 'museum',
          durationMin: 90,
          qualityScore: 0.7,
          cost: { amount: 15, currency: 'USD' },
          indoorOutdoor: 'indoor',
        },
      ],
    },
    signals: { lastUpdatedAt: new Date().toISOString() },
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
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            endTime: '11:00',
            title: 'Blue Lagoon',
            type: 'sightseeing',
            poiId: 'poi-1',
          },
          {
            id: 's2',
            time: '12:00',
            endTime: '13:30',
            title: 'Museum',
            type: 'museum',
            poiId: 'poi-2',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64, lng: -22 },
              to: { lat: 64.1, lng: -22 },
              durationMin: 30,
            },
          },
        ],
      },
    ],
    metrics: { estTotalCost: 500 },
  };
}

describe('DailyUtilityCalculatorService', () => {
  let service: DailyUtilityCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DailyUtilityCalculatorService],
    }).compile();

    service = module.get<DailyUtilityCalculatorService>(DailyUtilityCalculatorService);
  });

  it('应计算完整 ExpectedUtility', () => {
    const state = createBaseState();
    const plan = createBasePlan();
    const result = service.compute(plan, state);

    expect(result.dayUtilities).toHaveLength(1);
    expect(result.dayUtilities[0].breakdown.experienceScore).toBeGreaterThan(0);
    expect(result.dayUtilities[0].breakdown.costEfficiency).toBeGreaterThanOrEqual(0);
    expect(result.dayUtilities[0].breakdown.timeEfficiency).toBeGreaterThanOrEqual(0);
    expect(result.dayUtilities[0].breakdown.comfortScore).toBeGreaterThanOrEqual(0);
    expect(result.dayUtilities[0].breakdown.safetyScore).toBeGreaterThanOrEqual(0);
    expect(result.totalExpectedUtility).toBeGreaterThanOrEqual(0);
    expect(result.penalties.totalPenalty).toBeGreaterThanOrEqual(0);
  });

  it('ExperienceScore 应反映 POI 质量与多样性', () => {
    const state = createBaseState();
    const plan = createBasePlan();
    const breakdown = service.computeDayUtility(
      plan.days[0],
      state,
      { w_exp: 1, w_cost: 0, w_time: 0, w_comfort: 0, w_safety: 0 }
    );
    expect(breakdown.experienceScore).toBeGreaterThan(0.5);
  });

  it('CostEfficiency 应在低成本高体验时更高', () => {
    const state = createBaseState();
    state.context!.budget = { amount: 10000, currency: 'USD' };
    const plan = createBasePlan();
    const breakdown = service.computeDayUtility(
      plan.days[0],
      state,
      { w_exp: 0, w_cost: 1, w_time: 0, w_comfort: 0, w_safety: 0 }
    );
    expect(breakdown.costEfficiency).toBeGreaterThan(0);
  });

  it('TimeEfficiency 应反映有用时间占比', () => {
    const state = createBaseState();
    const plan = createBasePlan();
    const breakdown = service.computeDayUtility(
      plan.days[0],
      state,
      { w_exp: 0, w_cost: 0, w_time: 1, w_comfort: 0, w_safety: 0 }
    );
    expect(breakdown.timeEfficiency).toBeGreaterThan(0);
  });

  it('无活动日应返回中性分', () => {
    const state = createBaseState();
    const emptyDay: PlanDay = {
      day: 1,
      date: '2026-06-10',
      timeSlots: [],
    };
    const breakdown = service.computeDayUtility(
      emptyDay,
      state,
      { w_exp: 0.25, w_cost: 0.25, w_time: 0.25, w_comfort: 0.25, w_safety: 0 }
    );
    expect(breakdown.experienceScore).toBe(0.5);
    expect(breakdown.totalUtility).toBeGreaterThanOrEqual(0);
  });
});
