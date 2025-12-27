// src/trips/decision/__tests__/phase4-strategy-integration.spec.ts

/**
 * Phase 4 策略集成测试
 * 
 * 测试：
 * 1. Dr.Dre 自动插入休息日（基于连续疲劳检测）
 * 2. Abu 在 HARD violation 时更保守
 * 3. DEM evidence 强制规则验证
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TripDecisionEngineService } from '../trip-decision-engine.service';
import { DemDecisionEvidenceService } from '../services/dem-decision-evidence.service';
import { DemEvidenceEnforcerService } from '../services/dem-evidence-enforcer.service';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';

describe('Phase 4 Strategy Integration', () => {
  let decisionEngine: TripDecisionEngineService;
  let demEvidenceService: DemDecisionEvidenceService;
  let demEnforcerService: DemEvidenceEnforcerService;

  beforeEach(async () => {
    // 创建最小化的测试模块
    // 注意：这是一个简化的测试，实际集成测试需要完整的依赖注入
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemDecisionEvidenceService,
        DemEvidenceEnforcerService,
        // TripDecisionEngineService 需要很多依赖，这里只测试核心逻辑
      ],
    }).compile();

    demEvidenceService = module.get<DemDecisionEvidenceService>(DemDecisionEvidenceService);
    demEnforcerService = module.get<DemEvidenceEnforcerService>(DemEvidenceEnforcerService);
  });

  describe('Dr.Dre Rest Day Insertion', () => {
    it('should detect rolling fatigue and suggest rest day insertion', async () => {
      // 创建一个会导致连续疲劳的计划
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [
              {
                id: 'slot-1',
                time: '08:00',
                endTime: '18:00',
                title: 'Day 1 Activity',
                type: 'hiking',
              },
            ],
            terrainFacts: {
              totalAscent: 800,
              maxElevation: 3000,
              minElevation: 2800,
            },
          },
          {
            day: 2,
            date: '2024-01-02',
            timeSlots: [
              {
                id: 'slot-2',
                time: '08:00',
                endTime: '18:00',
                title: 'Day 2 Activity',
                type: 'hiking',
              },
            ],
            terrainFacts: {
              totalAscent: 700,
              maxElevation: 3200,
              minElevation: 3000,
            },
          },
          {
            day: 3,
            date: '2024-01-03',
            timeSlots: [
              {
                id: 'slot-3',
                time: '08:00',
                endTime: '18:00',
                title: 'Day 3 Activity',
                type: 'hiking',
              },
            ],
            terrainFacts: {
              totalAscent: 600,
              maxElevation: 3400,
              minElevation: 3200,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          soft: {
            maxDailyAscentM: 800,
          },
        },
      };

      // 生成 DEM evidence
      const result = await demEvidenceService.generateEvidencePipeline(plan, routeDirection);

      // 验证连续疲劳检测
      expect(result.rollingFatigue?.detected).toBe(true);
      expect(result.rollingFatigue?.startDay).toBe(1);
      expect(result.rollingFatigue?.endDay).toBe(3);
      expect(result.rollingFatigue?.rollingAscent3Days).toBeGreaterThan(2000);
      expect(result.rollingFatigue?.suggestedAction).toBe('INSERT_REST_DAY');

      // 验证可解释失败生成
      expect(result.explainableFailure).toBeDefined();
      if (result.explainableFailure) {
        expect(result.explainableFailure.userImpact).toBeDefined();
      }
    });
  });

  describe('DEM Evidence Enforcer Rules', () => {
    it('should prevent finalize when HARD violation exists', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 500,
              maxElevation: 5500, // 超过限制
              minElevation: 5000,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
        },
      };

      // 生成 DEM evidence
      const result = await demEvidenceService.generateEvidencePipeline(plan, routeDirection);

      // 验证 HARD violation
      expect(result.hasHardViolation).toBe(true);
      expect(result.canProceed).toBe(false);

      // 验证强制规则：不能 finalize
      const canFinalize = demEnforcerService.canFinalizePlan(result);
      expect(canFinalize.allowed).toBe(false);
      expect(canFinalize.reason).toContain('硬约束违规');
    });

    it('should prevent Neptune from repairing segment without evidence', () => {
      const result = {
        segmentEvidences: [],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const canRepair = demEnforcerService.canNeptuneRepairSegment('day-1', result);
      expect(canRepair.allowed).toBe(false);
      expect(canRepair.reason).toContain('没有 DEM 证据');
    });

    it('should prevent Abu from ignoring HARD violation', () => {
      const result = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 1000,
            maxSlopePct: 30,
            rollingAscent3Days: 0,
            fatigueIndex: 50,
            violation: 'HARD' as const,
            explanation: '海拔超过限制：5500m > 5000m',
          },
        ],
        hasHardViolation: true,
        hasSoftViolation: false,
        canProceed: false,
      };

      const canIgnore = demEnforcerService.canAbuIgnoreViolation('day-1', result);
      expect(canIgnore.allowed).toBe(false);
      expect(canIgnore.reason).toContain('HARD violation');
    });
  });

  describe('Explainable Failure Generation', () => {
    it('should generate user-friendly failure explanation', async () => {
      const plan: TripPlan = {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2024-01-01',
            timeSlots: [],
            terrainFacts: {
              totalAscent: 1000,
              maxElevation: 5500,
              minElevation: 4500,
            },
          },
        ],
      };

      const routeDirection: RouteDirectionData = {
        countryCode: 'NP',
        name: 'EBC Test',
        nameCN: 'EBC 测试',
        tags: ['hiking'],
        constraints: {
          hard: {
            maxElevationM: 5000,
          },
        },
      };

      const result = await demEvidenceService.generateEvidencePipeline(plan, routeDirection);

      expect(result.explainableFailure).toBeDefined();
      if (result.explainableFailure) {
        expect(result.explainableFailure.reason).toBeDefined();
        expect(result.explainableFailure.userImpact).toBeDefined();
        expect(result.explainableFailure.userImpact).toContain('不是因为你不行');
      }
    });
  });
});

