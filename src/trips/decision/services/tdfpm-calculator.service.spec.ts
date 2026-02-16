/**
 * TDFPM 计算服务单元测试
 *
 * Phase 2 疲劳预测模型验证
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  TdfpmCalculatorService,
  TdfpmDayContext,
  TdfpmResult,
} from './tdfpm-calculator.service';

describe('TdfpmCalculatorService', () => {
  let service: TdfpmCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TdfpmCalculatorService],
    }).compile();

    service = module.get<TdfpmCalculatorService>(TdfpmCalculatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRoadIntensity', () => {
    it('returns 1.0 for highway', () => {
      expect(service.getRoadIntensity('highway')).toBe(1.0);
      expect(service.getRoadIntensity('IS_HIGHWAY')).toBe(1.0);
    });

    it('returns 1.2 for paved/柏油', () => {
      expect(service.getRoadIntensity('paved')).toBe(1.2);
      expect(service.getRoadIntensity('柏油')).toBe(1.2);
    });

    it('returns 1.8 for gravel/砂石/山路', () => {
      expect(service.getRoadIntensity('gravel')).toBe(1.8);
      expect(service.getRoadIntensity('砂石')).toBe(1.8);
      expect(service.getRoadIntensity('山路')).toBe(1.8);
    });

    it('returns 1.2 when no match', () => {
      expect(service.getRoadIntensity(undefined)).toBe(1.2);
      expect(service.getRoadIntensity('unknown_type')).toBe(1.2);
    });
  });

  describe('computeFatigueScore', () => {
    it('returns LOW risk for short easy drive', () => {
      const ctx: TdfpmDayContext = {
        drivingHours: 3,
        roadType: 'highway',
        sleepHours: 8,
      };
      const r = service.computeFatigueScore(ctx);
      expect(r.fatigueScore).toBeLessThan(40);
      expect(r.riskLevel).toBe('LOW');
      expect(r.recommendation).toBe('OK');
    });

    it('returns higher drivingLoad for gravel vs highway', () => {
      const gravel = service.computeFatigueScore({
        drivingHours: 8,
        roadType: 'gravel',
        sleepHours: 8,
      });
      const highway = service.computeFatigueScore({
        drivingHours: 8,
        roadType: 'highway',
        sleepHours: 8,
      });
      expect(gravel.drivingLoad).toBe(14.4); // 8 * 1.8
      expect(highway.drivingLoad).toBe(8);  // 8 * 1.0
    });

    it('returns REST_SOON for long drive with low sleep + circadian penalty', () => {
      const ctx: TdfpmDayContext = {
        drivingHours: 8,
        roadType: 'gravel',
        sleepHours: 5,
        departureHour: 3, // 凌晨出发，CircadianPenalty +25
      };
      const r = service.computeFatigueScore(ctx);
      expect(r.recommendation).toMatch(/REST|SPLIT|STOP/);
    });

    it('returns STOP_DRIVING when score >= 80', () => {
      const ctx: TdfpmDayContext = {
        drivingHours: 17,
        roadType: 'gravel',
        sleepHours: 2,
        departureHour: 3, // CircadianPenalty +25
        weatherPenalty: 15,
        cognitiveLoad: 15,
      };
      const r = service.computeFatigueScore(ctx);
      expect(r.fatigueScore).toBeGreaterThanOrEqual(80);
      expect(r.recommendation).toBe('STOP_DRIVING');
    });

    it('reduces confidence when sleep/departure missing', () => {
      const full: TdfpmDayContext = { drivingHours: 4, sleepHours: 8, departureHour: 8 };
      const noSleep: TdfpmDayContext = { drivingHours: 4 };
      expect(service.computeFatigueScore(full).confidence).toBe(1.0);
      expect(service.computeFatigueScore(noSleep).confidence).toBeLessThan(1.0);
    });

    it('clamps fatigueScore to 0-100', () => {
      const veryLow: TdfpmDayContext = {
        drivingHours: 0.5,
        sleepHours: 10,
        breakMinutes: 60,
        hasNap: true,
      };
      const r = service.computeFatigueScore(veryLow);
      expect(r.fatigueScore).toBeGreaterThanOrEqual(0);
      expect(r.fatigueScore).toBeLessThanOrEqual(100);
    });
  });

  describe('computeRiskIndex', () => {
    it('equals fatigueScore when all factors are 1', () => {
      expect(service.computeRiskIndex(50)).toBe(50);
    });

    it('multiplies by weather/night/road factors', () => {
      const idx = service.computeRiskIndex(60, {
        weatherRisk: 1.2,
        nightFactor: 1.5,
        roadComplexity: 1.1,
      });
      expect(idx).toBeCloseTo(60 * 1.2 * 1.5 * 1.1);
    });
  });

  describe('shouldRecommendStop', () => {
    it('returns true when fatigueScore >= 80', () => {
      const r: TdfpmResult = {
        fatigueScore: 85,
        riskLevel: 'DANGEROUS',
        recommendation: 'STOP_DRIVING',
        drivingLoad: 100,
        confidence: 1,
      };
      expect(service.shouldRecommendStop(r)).toBe(true);
    });

    it('returns true when riskIndex > 120', () => {
      const r: TdfpmResult = {
        fatigueScore: 70,
        riskLevel: 'HIGH',
        recommendation: 'REST_NOW',
        drivingLoad: 80,
        confidence: 1,
      };
      expect(service.shouldRecommendStop(r, { weatherRisk: 2 })).toBe(true);
    });

    it('returns false for low fatigue', () => {
      const r: TdfpmResult = {
        fatigueScore: 40,
        riskLevel: 'MODERATE',
        recommendation: 'OK',
        drivingLoad: 40,
        confidence: 1,
      };
      expect(service.shouldRecommendStop(r)).toBe(false);
    });
  });
});
