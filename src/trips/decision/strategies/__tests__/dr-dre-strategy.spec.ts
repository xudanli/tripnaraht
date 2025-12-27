// src/trips/decision/strategies/__tests__/dr-dre-strategy.spec.ts
/**
 * Dr.Dre Strategy Regression Tests
 * 
 * 测试场景：
 * 1. 高负荷拆天
 * 2. 连续疲劳插 rest day
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DrDreStrategy } from '../dr-dre-strategy.service';
import { FatigueCalculatorService } from '../../services/fatigue-calculator.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  DecisionParams,
} from '../../shared/world-model.types';

describe('Dr.Dre Strategy Regression Tests', () => {
  let dre: DrDreStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DrDreStrategy, FatigueCalculatorService],
    }).compile();

    dre = module.get<DrDreStrategy>(DrDreStrategy);
  });

  describe('1. 高负荷拆天', () => {
    it('应该拆分高负荷的一天（fatigueIndex > 1.4）', async () => {
      const world: WorldModelContext = {
        countryCode: 'CH',
        month: 7,
        decisionParams: {
          maxDailyAscentM: 1000,
          rollingAscent3DaysM: 2500,
          maxSlopePct: 25,
          weatherRiskWeight: 0.5,
          bufferDayBias: 'MEDIUM',
          riskTolerance: 'MEDIUM',
        },
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 2000],
            cumulativeAscentM: 1000,
            maxSlopePct: 20,
            rollingFatigueIndex: 30,
            violation: 'NONE',
          },
        ],
      };

      // 创建一个高负荷的计划（单日爬升 2000m，超过阈值）
      const plan: RoutePlanDraft = {
        tripId: 'test_trip_dre_split',
        routeDirectionId: 'rd_ch_03',
        segments: [
          {
            segmentId: 'seg_1',
            dayIndex: 1,
            distanceKm: 15,
            ascentM: 1000,
            slopePct: 20,
          },
          {
            segmentId: 'seg_2',
            dayIndex: 1, // 同一天
            distanceKm: 10,
            ascentM: 1000, // 累计 2000m，超过 maxDailyAscentM
            slopePct: 25,
          },
          {
            segmentId: 'seg_3',
            dayIndex: 2,
            distanceKm: 12,
            ascentM: 600,
            slopePct: 15,
          },
        ],
      };

      const result = await dre.evaluate(world, plan);

      expect(result.action).toBe('ADJUST');
      expect(result.updatedPlan).toBeDefined();
      expect(result.logs.some(log => log.reasonCodes.includes('SPLIT_DAY'))).toBe(true);
      expect(result.logs.some(log => log.explanation.includes('拆分为两天'))).toBe(true);

      // 检查是否真的拆分了
      if (result.updatedPlan) {
        const day1Segments = result.updatedPlan.segments.filter(s => s.dayIndex === 1);
        const day2Segments = result.updatedPlan.segments.filter(s => s.dayIndex === 2);
        expect(day1Segments.length).toBeGreaterThan(0);
        expect(day2Segments.length).toBeGreaterThan(0);
      }
    });
  });

  describe('2. 连续疲劳插 rest day', () => {
    it('应该检测连续 3 天疲劳并插入缓冲日', async () => {
      const world: WorldModelContext = {
        countryCode: 'CH',
        month: 7,
        decisionParams: {
          maxDailyAscentM: 1000,
          rollingAscent3DaysM: 2500, // 3 天阈值 2500m
          maxSlopePct: 25,
          weatherRiskWeight: 0.5,
          bufferDayBias: 'MEDIUM',
          riskTolerance: 'MEDIUM',
        },
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
      };

      // 创建一个连续 3 天高爬升的计划（累计超过 2500m）
      const plan: RoutePlanDraft = {
        tripId: 'test_trip_dre_rolling',
        routeDirectionId: 'rd_ch_03',
        segments: [
          {
            segmentId: 'seg_1',
            dayIndex: 1,
            distanceKm: 12,
            ascentM: 900, // 第 1 天
            slopePct: 18,
          },
          {
            segmentId: 'seg_2',
            dayIndex: 2,
            distanceKm: 14,
            ascentM: 900, // 第 2 天，累计 1800m
            slopePct: 20,
          },
          {
            segmentId: 'seg_3',
            dayIndex: 3,
            distanceKm: 15,
            ascentM: 900, // 第 3 天，累计 2700m > 2500m
            slopePct: 22,
          },
          {
            segmentId: 'seg_4',
            dayIndex: 4,
            distanceKm: 10,
            ascentM: 500,
            slopePct: 15,
          },
        ],
      };

      const result = await dre.evaluate(world, plan);

      expect(result.action).toBe('ADJUST');
      expect(result.updatedPlan).toBeDefined();
      expect(result.logs.some(log => log.reasonCodes.includes('INSERT_BUFFER_DAY'))).toBe(true);
      expect(result.logs.some(log => log.explanation.includes('插入缓冲日'))).toBe(true);

      // 检查是否真的插入了缓冲日
      if (result.updatedPlan) {
        const bufferSegments = result.updatedPlan.segments.filter(
          s => s.metadata?.type === 'REST_DAY'
        );
        expect(bufferSegments.length).toBeGreaterThan(0);
      }
    });
  });

  describe('3. 正常计划 → ALLOW', () => {
    it('应该允许节奏合理的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'CH',
        month: 7,
        decisionParams: {
          maxDailyAscentM: 1000,
          rollingAscent3DaysM: 2500,
          maxSlopePct: 25,
          weatherRiskWeight: 0.5,
          bufferDayBias: 'MEDIUM',
          riskTolerance: 'MEDIUM',
        },
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
      };

      // 创建一个节奏合理的计划
      const plan: RoutePlanDraft = {
        tripId: 'test_trip_dre_normal',
        routeDirectionId: 'rd_ch_01',
        segments: [
          {
            segmentId: 'seg_1',
            dayIndex: 1,
            distanceKm: 10,
            ascentM: 500,
            slopePct: 12,
          },
          {
            segmentId: 'seg_2',
            dayIndex: 2,
            distanceKm: 12,
            ascentM: 600,
            slopePct: 15,
          },
          {
            segmentId: 'seg_3',
            dayIndex: 3,
            distanceKm: 11,
            ascentM: 550,
            slopePct: 14,
          },
        ],
      };

      const result = await dre.evaluate(world, plan);

      expect(result.action).toBe('ALLOW');
      expect(result.logs[0].explanation).toContain('无需结构调整');
    });
  });
});

