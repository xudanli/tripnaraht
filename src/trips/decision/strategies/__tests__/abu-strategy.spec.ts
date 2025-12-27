// src/trips/decision/strategies/__tests__/abu-strategy.spec.ts
/**
 * Abu Strategy Regression Tests
 * 
 * 测试场景：
 * 1. 硬风险 → REJECT
 * 2. 无 DEM → REJECT
 * 3. 正常通过 → ALLOW
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AbuStrategy } from '../abu-strategy.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  DecisionParams,
} from '../../shared/world-model.types';

describe('Abu Strategy Regression Tests', () => {
  let abu: AbuStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AbuStrategy],
    }).compile();

    abu = module.get<AbuStrategy>(AbuStrategy);
  });

  describe('1. 硬风险 → REJECT', () => {
    it('应该拒绝有 DEM 硬违规的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 2000, 3000],
            cumulativeAscentM: 2000,
            maxSlopePct: 35, // 超过阈值
            rollingFatigueIndex: 50,
            violation: 'HARD',
            notes: '坡度超过安全阈值',
          },
        ],
      };

      const plan = createTestPlan();

      const result = await abu.evaluate(world, plan);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('REJECT');
      expect(result.logs[0].reasonCodes).toContain('HARD_DEM_VIOLATION');
      expect(result.logs[0].explanation).toContain('DEM 硬违规');
    });

    it('应该拒绝有天气硬违规的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 1500],
            cumulativeAscentM: 500,
            maxSlopePct: 15,
            rollingFatigueIndex: 20,
            violation: 'NONE',
          },
        ],
        weatherEvidence: [
          {
            segmentId: 'seg_1',
            windSpeedMs: 20, // 高风速
            visibilityM: 50, // 低能见度
            precipitationMm: 10,
            violation: 'HARD',
          },
        ],
      };

      const plan = createTestPlan();

      const result = await abu.evaluate(world, plan);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('REJECT');
      expect(result.logs[0].reasonCodes).toContain('HARD_WEATHER_VIOLATION');
    });

    it('应该拒绝有合规硬违规的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 1500],
            cumulativeAscentM: 500,
            maxSlopePct: 15,
            rollingFatigueIndex: 20,
            violation: 'NONE',
          },
        ],
        complianceEvidence: [
          {
            requiresPermit: true,
            requiresGuide: false,
            valid: false, // 未获得许可
            violation: 'HARD',
          },
        ],
      };

      const plan = createTestPlan();

      const result = await abu.evaluate(world, plan);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('REJECT');
      expect(result.logs[0].reasonCodes).toContain('HARD_COMPLIANCE_VIOLATION');
    });
  });

  describe('2. 无 DEM → REJECT', () => {
    it('应该拒绝没有 DEM 证据的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [], // 无 DEM 证据
      };

      const plan = createTestPlan();

      const result = await abu.evaluate(world, plan);

      expect(result.allowed).toBe(false);
      expect(result.action).toBe('REJECT');
      expect(result.logs[0].reasonCodes).toContain('NO_DEM_EVIDENCE');
      expect(result.logs[0].explanation).toContain('缺少 DEM 决策证据');
    });
  });

  describe('3. 正常通过 → ALLOW', () => {
    it('应该允许没有违规的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 1500, 2000],
            cumulativeAscentM: 1000,
            maxSlopePct: 20,
            rollingFatigueIndex: 30,
            violation: 'NONE',
          },
        ],
        weatherEvidence: [
          {
            segmentId: 'seg_1',
            windSpeedMs: 8,
            visibilityM: 10000,
            precipitationMm: 0,
            violation: 'NONE',
          },
        ],
        complianceEvidence: [
          {
            requiresPermit: false,
            requiresGuide: false,
            valid: true,
            violation: 'NONE',
          },
        ],
      };

      const plan = createTestPlan();

      const result = await abu.evaluate(world, plan);

      expect(result.allowed).toBe(true);
      expect(result.action).toBe('ALLOW');
      expect(result.logs[0].explanation).toContain('未发现硬性风险问题');
    });
  });

  // Helper functions
  function createDefaultDecisionParams(): DecisionParams {
    return {
      maxDailyAscentM: 1000,
      rollingAscent3DaysM: 2500,
      maxSlopePct: 25,
      weatherRiskWeight: 0.5,
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    };
  }

  function createTestPlan(): RoutePlanDraft {
    return {
      tripId: 'test_trip_abu',
      routeDirectionId: 'rd_is_01',
      segments: [
        {
          segmentId: 'seg_1',
          dayIndex: 1,
          distanceKm: 50,
          ascentM: 500,
          slopePct: 10,
        },
      ],
    };
  }
});

