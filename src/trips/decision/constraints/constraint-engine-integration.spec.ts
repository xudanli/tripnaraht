/**
 * Constraint Engine × DailyUtility 集成测试
 *
 * 验证：约束前置 → 可行方案才进入 Utility 评分
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEngineService } from './constraint-engine.service';
import { ConstraintChecker } from './constraint-checker';
import { DailyUtilityCalculatorService } from '../optimization/daily-utility';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';

function createState(overrides: Partial<TripWorldState> = {}): TripWorldState {
  return {
    context: {
      destination: 'Iceland',
      startDate: '2026-06-10',
      durationDays: 2,
      budget: { amount: 2000, currency: 'USD' },
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {
      '2026-06-10': [
        {
          id: 'poi-1',
          name: { en: 'Museum' },
          type: 'museum',
          durationMin: 90,
          indoorOutdoor: 'indoor',
          openingHours: [{ date: '2026-06-10', windows: [{ start: '09:00', end: '18:00' }] }],
          cost: { amount: 20, currency: 'USD' },
        },
      ],
    },
    signals: { lastUpdatedAt: new Date().toISOString() },
    ...overrides,
  };
}

function createFeasiblePlan(): TripPlan {
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
            time: '10:00',
            endTime: '11:30',
            title: 'Museum',
            type: 'museum',
            poiId: 'poi-1',
          },
        ],
      },
    ],
    metrics: { estTotalCost: 500 },
  };
}

describe('Constraint Engine × DailyUtility 集成', () => {
  let constraintEngine: ConstraintEngineService;
  let dailyUtility: DailyUtilityCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEngineService,
        ConstraintChecker,
        DailyUtilityCalculatorService,
      ],
    }).compile();

    constraintEngine = module.get(ConstraintEngineService);
    dailyUtility = module.get(DailyUtilityCalculatorService);
  });

  it('可行方案应通过 isFeasible 并得到 Utility 评分', async () => {
    const state = createState();
    const plan = createFeasiblePlan();

    const feasible = await constraintEngine.isFeasible(state, plan);
    expect(feasible.feasible).toBe(true);

    const utility = dailyUtility.compute(plan, state);
    expect(utility.totalExpectedUtility).toBeGreaterThanOrEqual(0);
    expect(utility.dayUtilities).toHaveLength(1);
  });

  it('时间窗违规方案应 infeasible，不应参与评分', async () => {
    const state = createState();
    state.candidatesByDate!['2026-06-10'] = [
      {
        id: 'poi-1',
        name: { en: 'Closed' },
        type: 'museum',
        durationMin: 90,
        openingHours: [{ date: '2026-06-10', windows: [{ start: '14:00', end: '18:00' }] }],
      },
    ];
    const plan = createFeasiblePlan();
    plan.days[0].timeSlots[0].time = '09:00';
    plan.days[0].timeSlots[0].endTime = '10:30';

    const feasible = await constraintEngine.isFeasible(state, plan);
    expect(feasible.feasible).toBe(false);
    expect(feasible.violations.some(v => v.code === 'TIME_WINDOW_VIOLATION')).toBe(true);

    // 即使调用 compute，也仅表示「若评分」的结果；业务上不应对 infeasible 方案评分
    // 此处验证：infeasible 时 isFeasible 正确拦截
  });

  it('max_daily_drive 超限方案应 infeasible', async () => {
    const state = createState();
    (state as any).policies = {
      constraintDSL: {
        hard_constraints: {
          travel_mode: { max_daily_drive: { value: 1, unit: 'hour' } },
        },
      },
    };
    state.candidatesByDate!['2026-06-10'] = [
      { id: 'poi-a', name: { en: 'A' }, type: 'sightseeing', durationMin: 60 },
      { id: 'poi-b', name: { en: 'B' }, type: 'sightseeing', durationMin: 60 },
    ];
    const plan = createFeasiblePlan();
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
        time: '14:00',
        endTime: '15:00',
        title: 'B',
        type: 'sightseeing',
        poiId: 'poi-b',
        coordinates: { lat: 65, lng: -21 },
        travelLegFromPrev: {
          mode: 'drive',
          from: { lat: 64, lng: -22 },
          to: { lat: 65, lng: -21 },
          durationMin: 120, // 2h > 1h limit
        },
      },
    ];

    const feasible = await constraintEngine.isFeasible(state, plan);
    expect(feasible.feasible).toBe(false);
    expect(feasible.violations.some(v => v.code === 'MAX_DAILY_DRIVE_EXCEEDED')).toBe(true);
  });
});
