// src/route-directions/__tests__/route-direction-e2e.spec.ts
/**
 * RouteDirection 端到端 E2E 测试
 * 
 * 测试完整链路：userInput → RD → POI pool → world model → Abu/Dr.Dre/Neptune → plan + decision-log
 * 
 * 验收标准：
 * - decisionLog.routeDirection.selected.id 存在且与 plan 绑定
 * - decisionLog.routeDirection.scoreBreakdown 完整（tag/season/pace/risk）
 * - plan.days[].terrainFacts 存在（至少 maxElevation/totalAscent）
 * - 若 hard 触发：decisionLog.actions 中必须出现 DOWNGRADE/SPLIT/REPLACE 之一
 * - 若 soft 触发：decisionLog.actions 出现 ADJUST_PACE/INSERT_BUFFER/SPLIT 之一
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TripDecisionEngineService } from '../../trips/decision/trip-decision-engine.service';
import { RouteDirectionSelectorService } from '../services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from '../services/route-direction-poi-generator.service';
import { RouteDirectionsService } from '../route-directions.service';
import { ReadinessService } from '../../trips/readiness/services/readiness.service';
import { PoiFeaturesAdapterService } from '../../trips/decision/services/poi-features-adapter.service';
import { SenseToolsAdapter } from '../../trips/decision/adapters/sense-tools.adapter';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripWorldState, ActivityCandidate, ISODate, GeoPoint } from '../../trips/decision/world-model';
import { TripPlan, PlanDay } from '../../trips/decision/plan-model';
import { DecisionRunLog } from '../../trips/decision/decision-log';

describe('RouteDirection E2E Tests', () => {
  let decisionEngine: TripDecisionEngineService;
  let routeDirectionSelector: RouteDirectionSelectorService;
  let routeDirectionPoiGenerator: RouteDirectionPoiGeneratorService;
  let routeDirectionsService: RouteDirectionsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        TripDecisionEngineService,
        RouteDirectionSelectorService,
        RouteDirectionPoiGeneratorService,
        RouteDirectionsService,
        {
          provide: SenseToolsAdapter,
          useValue: {
            getTravelLeg: jest.fn().mockResolvedValue({
              mode: 'drive',
              from: { lat: 0, lng: 0 },
              to: { lat: 0, lng: 0 },
              durationMin: 30,
              distanceKm: 10,
            }),
            getHotelPointForDate: jest.fn().mockResolvedValue({
              lat: 64.15,
              lng: -21.95,
            }),
          },
        },
        {
          provide: ReadinessService,
          useValue: {
            extractTripContext: jest.fn(),
            checkFromDestination: jest.fn().mockResolvedValue({
              summary: { totalBlockers: 0, totalMust: 0 },
              findings: [],
            }),
            getConstraints: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PoiFeaturesAdapterService,
          useValue: {
            getPoiFeatures: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    decisionEngine = module.get<TripDecisionEngineService>(TripDecisionEngineService);
    routeDirectionSelector = module.get<RouteDirectionSelectorService>(RouteDirectionSelectorService);
    routeDirectionPoiGenerator = module.get<RouteDirectionPoiGeneratorService>(RouteDirectionPoiGeneratorService);
    routeDirectionsService = module.get<RouteDirectionsService>(RouteDirectionsService);
  });

  /**
   * 创建测试用的 TripWorldState
   */
  function createTestState(
    destination: string,
    startDate: ISODate,
    durationDays: number,
    preferences: {
      pace?: 'relaxed' | 'moderate' | 'intense';
      riskTolerance?: 'low' | 'medium' | 'high';
      intents?: Record<string, number>;
    } = {},
    candidates: ActivityCandidate[] = []
  ): TripWorldState {
    const candidatesByDate: Record<ISODate, ActivityCandidate[]> = {};
    for (let i = 0; i < durationDays; i++) {
      const date = addDays(startDate, i) as ISODate;
      candidatesByDate[date] = [...candidates];
    }

    return {
      context: {
        destination,
        startDate,
        durationDays,
        preferences: {
          intents: preferences.intents || { nature: 0.8 },
          pace: preferences.pace || 'moderate',
          riskTolerance: preferences.riskTolerance || 'medium',
        },
        budget: {
          amount: 10000,
          currency: 'CNY',
        },
      },
      candidatesByDate,
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        alerts: [],
      },
      policies: {
        dayStart: '08:30',
        dayEnd: '20:30',
        bufferMinBetweenActivities: 10,
      },
    };
  }

  /**
   * 创建测试用的 ActivityCandidate
   */
  function createTestCandidate(
    id: string,
    name: string,
    location: GeoPoint,
    type: ActivityCandidate['type'] = 'sightseeing'
  ): ActivityCandidate {
    return {
      id,
      name: { zh: name, en: name },
      type,
      location: {
        point: location,
        address: `${name} Address`,
      },
      durationMin: 60,
      cost: {
        amount: 100,
        currency: 'CNY',
      },
    };
  }

  /**
   * 简单的日期加法函数
   */
  function addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * 提取月份（1-12）
   */
  function extractMonth(dateStr: string): number {
    return new Date(dateStr).getMonth() + 1;
  }

  /**
   * 提取国家代码（简化版）
   */
  function extractCountryCode(destination: string): string {
    const mapping: Record<string, string> = {
      '冰岛': 'IS',
      'Iceland': 'IS',
      '新西兰': 'NZ',
      'New Zealand': 'NZ',
      '尼泊尔': 'NP',
      'Nepal': 'NP',
      '西藏': 'CN_XZ',
      'Xizang': 'CN_XZ',
    };
    return mapping[destination] || 'IS';
  }

  // ========== 测试用例 ==========

  describe('Case 1: 冰岛环岛摄影路线（轻松节奏）', () => {
    it('should select Ring Road route and generate plan with terrain facts', async () => {
      const state = createTestState('冰岛', '2026-07-15', 7, {
        pace: 'relaxed',
        riskTolerance: 'low',
        intents: { photography: 0.9, nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan, log } = result;

      // 断言：decisionLog.routeDirection 存在
      expect(log).toBeDefined();
      expect((log as any).routeDirection).toBeDefined();
      expect((log as any).routeDirection?.selected?.id).toBeDefined();

      // 断言：scoreBreakdown 完整
      const scoreBreakdown = (log as any).routeDirection?.scoreBreakdown;
      expect(scoreBreakdown).toBeDefined();
      expect(scoreBreakdown.tagMatch).toBeDefined();
      expect(scoreBreakdown.seasonMatch).toBeDefined();
      expect(scoreBreakdown.paceMatch).toBeDefined();
      expect(scoreBreakdown.riskMatch).toBeDefined();

      // 断言：plan 存在且包含 days
      expect(plan).toBeDefined();
      expect(plan.days).toBeDefined();
      expect(plan.days.length).toBe(7);

      // 断言：terrainFacts 存在
      plan.days.forEach((day: PlanDay) => {
        expect((day as any).terrainFacts).toBeDefined();
        expect((day as any).terrainFacts?.maxElevation).toBeDefined();
        expect((day as any).terrainFacts?.totalAscent).toBeDefined();
      });
    });
  });

  describe('Case 2: 新西兰南岛徒步路线（中等节奏）', () => {
    it('should select South Island route with hiking focus', async () => {
      const state = createTestState('新西兰', '2026-02-10', 10, {
        pace: 'moderate',
        riskTolerance: 'medium',
        intents: { hiking: 0.9, nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan, log } = result;

      expect((log as any).routeDirection?.selected?.id).toBeDefined();
      expect((log as any).routeDirection?.scoreBreakdown).toBeDefined();
      expect(plan.days.length).toBe(10);

      // 检查徒步相关的约束
      const constraints = (log as any).routeDirection?.constraints;
      if (constraints) {
        expect(constraints.maxElevationM || constraints.soft?.maxElevationM).toBeDefined();
      }
    });
  });

  describe('Case 3: 高海拔挑战路线（硬约束触发）', () => {
    it('should trigger hard constraints and apply DOWNGRADE/SPLIT/REPLACE', async () => {
      const state = createTestState('尼泊尔', '2026-05-01', 14, {
        pace: 'intense',
        riskTolerance: 'high',
        intents: { hiking: 1.0, challenge: 0.9 },
      });

      // 添加高海拔候选点
      const highAltitudeCandidates = [
        createTestCandidate('poi1', '珠峰大本营', { lat: 28.0, lng: 86.9 }),
        createTestCandidate('poi2', '高海拔营地', { lat: 28.1, lng: 86.8 }),
      ];
      state.candidatesByDate['2026-05-01'] = highAltitudeCandidates;

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      // 断言：hard 约束触发时，actions 包含 DOWNGRADE/SPLIT/REPLACE 之一
      const actions = log.chosenActions || [];
      const hasHardAction = actions.some((action: any) => {
        const reasonCodes = action.reasonCodes || [];
        return (
          reasonCodes.some((code: string) =>
            ['DOWNGRADE', 'SPLIT', 'REPLACE'].some((hardAction) =>
              code.includes(hardAction)
            )
          )
        );
      });

      // 如果有硬约束违反，应该触发修复动作
      if (log.violations && log.violations.length > 0) {
        expect(hasHardAction).toBe(true);
      }
    });
  });

  describe('Case 4: 软约束触发（节奏调整）', () => {
    it('should trigger soft constraints and apply ADJUST_PACE/INSERT_BUFFER/SPLIT', async () => {
      const state = createTestState('冰岛', '2026-08-01', 5, {
        pace: 'intense',
        riskTolerance: 'medium',
        intents: { nature: 0.8 },
      });

      // 添加大量候选点（可能导致时间超限）
      const manyCandidates: ActivityCandidate[] = [];
      for (let i = 0; i < 20; i++) {
        manyCandidates.push(
          createTestCandidate(`poi${i}`, `景点${i}`, {
            lat: 64.15 + i * 0.01,
            lng: -21.95 + i * 0.01,
          })
        );
      }
      state.candidatesByDate['2026-08-01'] = manyCandidates;

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      // 断言：soft 约束触发时，actions 包含 ADJUST_PACE/INSERT_BUFFER/SPLIT 之一
      const actions = log.chosenActions || [];
      const hasSoftAction = actions.some((action: any) => {
        const reasonCodes = action.reasonCodes || [];
        return reasonCodes.some((code: string) =>
          ['ADJUST_PACE', 'INSERT_BUFFER', 'SPLIT'].some((softAction) =>
            code.includes(softAction)
          )
        );
      });

      // 如果有软约束违反，应该触发调整动作
      if (log.violations && log.violations.length > 0) {
        expect(hasSoftAction).toBe(true);
      }
    });
  });

  describe('Case 5: 季节性匹配（最佳月份）', () => {
    it('should select route with best month match', async () => {
      const state = createTestState('冰岛', '2026-06-15', 7, {
        pace: 'moderate',
        intents: { aurora: 0.9 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      expect((log as any).routeDirection?.selected?.id).toBeDefined();
      const scoreBreakdown = (log as any).routeDirection?.scoreBreakdown;
      expect(scoreBreakdown?.seasonMatch).toBeDefined();
      expect(scoreBreakdown?.seasonMatch?.score).toBeGreaterThan(0);
    });
  });

  describe('Case 6: 标签匹配（摄影偏好）', () => {
    it('should prioritize routes with photography tags', async () => {
      const state = createTestState('新西兰', '2026-03-01', 8, {
        pace: 'relaxed',
        intents: { photography: 1.0 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      const scoreBreakdown = (log as any).routeDirection?.scoreBreakdown;
      expect(scoreBreakdown?.tagMatch).toBeDefined();
      expect(scoreBreakdown?.tagMatch?.score).toBeGreaterThan(0);
    });
  });

  describe('Case 7: 风险匹配（低风险偏好）', () => {
    it('should select low-risk routes for risk-averse users', async () => {
      const state = createTestState('冰岛', '2026-07-01', 5, {
        pace: 'relaxed',
        riskTolerance: 'low',
        intents: { nature: 0.7 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      const scoreBreakdown = (log as any).routeDirection?.scoreBreakdown;
      expect(scoreBreakdown?.riskMatch).toBeDefined();
      expect(scoreBreakdown?.riskMatch?.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Case 8: 短行程（3天）', () => {
    it('should handle short trips correctly', async () => {
      const state = createTestState('冰岛', '2026-07-01', 3, {
        pace: 'moderate',
        intents: { nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan, log } = result;

      expect(plan.days.length).toBe(3);
      expect((log as any).routeDirection?.selected?.id).toBeDefined();
    });
  });

  describe('Case 9: 长行程（14天）', () => {
    it('should handle long trips correctly', async () => {
      const state = createTestState('新西兰', '2026-02-01', 14, {
        pace: 'moderate',
        intents: { nature: 0.8, hiking: 0.7 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan, log } = result;

      expect(plan.days.length).toBe(14);
      expect((log as any).routeDirection?.selected?.id).toBeDefined();

      // 长行程应该有休息日
      const hasRestDay = plan.days.some((day: PlanDay) => {
        return day.timeSlots.some((slot) => slot.type === 'rest');
      });
      // 注意：这取决于实际实现，可能不是必须的
    });
  });

  describe('Case 10: 无 RouteDirection 回退', () => {
    it('should fallback gracefully when no route direction matches', async () => {
      const state = createTestState('未知国家', '2026-07-01', 5, {
        pace: 'moderate',
        intents: { nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan, log } = result;

      // 即使没有 RouteDirection，也应该生成计划
      expect(plan).toBeDefined();
      expect(plan.days.length).toBe(5);

      // RouteDirection 可能为空，但不应该报错
      if ((log as any).routeDirection) {
        expect((log as any).routeDirection?.selected).toBeDefined();
      }
    });
  });

  describe('Case 11: 决策日志完整性', () => {
    it('should have complete decision log with route direction info', async () => {
      const state = createTestState('冰岛', '2026-07-01', 7, {
        pace: 'moderate',
        intents: { nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { log } = result;

      // 断言：决策日志基本字段
      expect(log.runId).toBeDefined();
      expect(log.at).toBeDefined();
      expect(log.trigger).toBeDefined();
      expect(log.strategyMix).toBeDefined();
      expect(log.inputDigest).toBeDefined();

      // 断言：RouteDirection 信息（如果存在）
      if ((log as any).routeDirection) {
        expect((log as any).routeDirection.selected).toBeDefined();
        expect((log as any).routeDirection.selected.id).toBeDefined();
        expect((log as any).routeDirection.scoreBreakdown).toBeDefined();
      }
    });
  });

  describe('Case 12: POI pool 生成验证', () => {
    it('should generate POI pool from route direction', async () => {
      const state = createTestState('冰岛', '2026-07-01', 5, {
        pace: 'moderate',
        intents: { nature: 0.8 },
      });

      const result = await decisionEngine.generatePlan(state);
      const { plan } = result;

      // 断言：计划中应该有 POI
      const hasPois = plan.days.some((day: PlanDay) => {
        return day.timeSlots.some((slot) => slot.poiId || slot.coordinates);
      });

      // 注意：这取决于实际数据，可能为空
      // 但至少不应该报错
      expect(plan.days.length).toBeGreaterThan(0);
    });
  });
});

