// src/trips/readiness/services/__tests__/risk-quantification.service.spec.ts

import { RiskQuantificationService } from '../risk-quantification.service';
import { HazardType, RuleSeverity } from '../../types/readiness-pack.types';

describe('RiskQuantificationService', () => {
  let service: RiskQuantificationService;

  beforeEach(() => {
    service = new RiskQuantificationService();
  });

  describe('quantifyRisk', () => {
    it('应该为高风险天气风险计算量化指标', () => {
      const result = service.quantifyRisk('weather_extreme', 'high', undefined, 'zh');

      expect(result.score).toBe(0.8);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.length).toBeGreaterThan(0);
      expect(result.levelExplanation).toBeDefined();
    });

    it('应该为中等风险地形风险计算量化指标', () => {
      const result = service.quantifyRisk('terrain', 'medium', undefined, 'zh');

      expect(result.score).toBe(0.5);
      expect(result.levelExplanation).toBeDefined();
    });

    it('应该为高风险水上安全风险计算量化指标和对比', () => {
      const result = service.quantifyRisk('water_safety', 'high', undefined, 'zh');

      expect(result.score).toBe(0.8);
      expect(result.metrics).toBeDefined();
      expect(result.comparison).toBeDefined();
      expect(result.comparison?.baseline).toBeDefined();
      expect(result.comparison?.difference).toBeDefined();
    });

    it('应该为高风险医疗资源风险计算量化指标', () => {
      const result = service.quantifyRisk('healthcare_gap', 'high', undefined, 'zh');

      expect(result.score).toBe(0.8);
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.some(m => 
        (typeof m.name === 'string' ? m.name : m.name.zh || m.name.en).includes('医院')
      )).toBe(true);
    });

    it('应该支持英文和中文', () => {
      const resultZh = service.quantifyRisk('weather_extreme', 'high', undefined, 'zh');
      const resultEn = service.quantifyRisk('weather_extreme', 'high', undefined, 'en');

      expect(resultZh.levelExplanation).toBeDefined();
      expect(resultEn.levelExplanation).toBeDefined();
      
      // 检查解释是否不同（语言不同）
      const zhExplanation = typeof resultZh.levelExplanation === 'string'
        ? resultZh.levelExplanation
        : resultZh.levelExplanation.zh || resultZh.levelExplanation.en;
      const enExplanation = typeof resultEn.levelExplanation === 'string'
        ? resultEn.levelExplanation
        : resultEn.levelExplanation.en || resultEn.levelExplanation.zh;
      
      expect(zhExplanation).not.toBe(enExplanation);
    });

    it('应该基于严重程度计算风险评分', () => {
      const highRisk = service.quantifyRisk('weather_extreme', 'high');
      const mediumRisk = service.quantifyRisk('weather_extreme', 'medium');
      const lowRisk = service.quantifyRisk('weather_extreme', 'low');

      expect(highRisk.score).toBeGreaterThan(mediumRisk.score);
      expect(mediumRisk.score).toBeGreaterThan(lowRisk.score);
    });

    it('应该为所有风险类型提供量化指标', () => {
      const riskTypes: HazardType[] = [
        'weather_extreme',
        'terrain',
        'water_safety',
        'wildlife',
        'healthcare_gap',
        'logistics_remote',
        'crime',
        'regulatory',
      ];

      for (const riskType of riskTypes) {
        const result = service.quantifyRisk(riskType, 'high', undefined, 'zh');
        expect(result.score).toBeDefined();
        expect(result.levelExplanation).toBeDefined();
      }
    });

    it('应该在有地理特征上下文时使用实际数据', () => {
      const context = {
        geo: {
          mountains: {
            inMountain: true,
            mountainElevationAvg: 3500,
            terrainComplexity: 0.8,
          },
        },
      } as any;

      const result = service.quantifyRisk('terrain', 'high', context, 'zh');

      expect(result.metrics).toBeDefined();
      // 应该包含基于实际海拔的指标
      const hasElevationMetric = result.metrics?.some(m => {
        const name = typeof m.name === 'string' ? m.name : m.name.zh || m.name.en;
        return name.includes('海拔') || name.includes('Elevation');
      });
      expect(hasElevationMetric).toBe(true);
    });
  });
});
