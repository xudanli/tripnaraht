// src/trips/readiness/services/__tests__/trust-metrics.service.spec.ts

import { TrustMetricsService } from '../trust-metrics.service';
import { ReadinessCheckResult } from '../../types/readiness-findings.types';

describe('TrustMetricsService', () => {
  let service: TrustMetricsService;

  beforeEach(() => {
    service = new TrustMetricsService();
  });

  describe('calculateTrustMetrics', () => {
    it('应该计算能力信任分数', () => {
      const result: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'TEST',
            packId: 'pack.test',
            packVersion: '1.0.0',
            blockers: [
              {
                id: 'rule.test',
                category: 'safety_hazards',
                severity: 'high',
                level: 'blocker',
                message: 'Test blocker',
                evidence: [
                  { sourceId: 'tourism.official', quote: 'Official source' },
                ],
              },
            ],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 1,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      const metrics = service.calculateTrustMetrics(result, 'zh');

      expect(metrics.capability.score).toBeGreaterThan(0);
      expect(metrics.capability.score).toBeLessThanOrEqual(1);
      expect(metrics.capability.factors.length).toBeGreaterThan(0);
    });

    it('应该计算善意信任分数', () => {
      const result: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'TEST',
            packId: 'pack.test',
            packVersion: '1.0.0',
            blockers: [
              {
                id: 'rule.test',
                category: 'safety_hazards',
                severity: 'high',
                level: 'blocker',
                message: 'Test blocker for safety',
                tasks: [
                  {
                    title: { en: 'Safety task', zh: '安全任务' },
                  },
                ],
                evidence: [{ sourceId: 'official' }],
              },
            ],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 1,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
        disclaimer: {
          message: 'Disclaimer',
        },
      };

      const metrics = service.calculateTrustMetrics(result, 'zh');

      expect(metrics.benevolence.score).toBeGreaterThan(0);
      expect(metrics.benevolence.score).toBeLessThanOrEqual(1);
      expect(metrics.benevolence.factors.length).toBeGreaterThan(0);
    });

    it('应该计算可预测性信任分数', () => {
      const result: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'TEST',
            packId: 'pack.test',
            packVersion: '1.0.0',
            blockers: [
              {
                id: 'rule.test',
                category: 'safety_hazards',
                severity: 'high',
                level: 'blocker',
                message: 'Clear explanation of why this rule triggers',
                evidence: [
                  { sourceId: 'official', quote: 'Evidence quote' },
                ],
              },
            ],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 1,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      const metrics = service.calculateTrustMetrics(result, 'zh');

      expect(metrics.predictability.score).toBeGreaterThan(0);
      expect(metrics.predictability.score).toBeLessThanOrEqual(1);
      expect(metrics.predictability.factors.length).toBeGreaterThan(0);
    });

    it('应该计算总体信任分数', () => {
      const result: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'TEST',
            packId: 'pack.test',
            packVersion: '1.0.0',
            blockers: [],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 0,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      const metrics = service.calculateTrustMetrics(result, 'zh');

      expect(metrics.overall).toBeGreaterThan(0);
      expect(metrics.overall).toBeLessThanOrEqual(1);
      expect(metrics.overall).toBeCloseTo(
        metrics.capability.score * 0.4 +
        metrics.benevolence.score * 0.35 +
        metrics.predictability.score * 0.25,
        2
      );
    });

    it('应该支持英文和中文', () => {
      const result: ReadinessCheckResult = {
        findings: [
          {
            destinationId: 'TEST',
            packId: 'pack.test',
            packVersion: '1.0.0',
            blockers: [],
            must: [],
            should: [],
            optional: [],
            risks: [],
          },
        ],
        summary: {
          totalBlockers: 0,
          totalMust: 0,
          totalShould: 0,
          totalOptional: 0,
          totalRisks: 0,
        },
      };

      const metricsZh = service.calculateTrustMetrics(result, 'zh');
      const metricsEn = service.calculateTrustMetrics(result, 'en');

      expect(metricsZh.capability.explanation).toBeDefined();
      expect(metricsEn.capability.explanation).toBeDefined();

      // 分数应该相同，但解释可能不同
      expect(metricsZh.overall).toBe(metricsEn.overall);
    });
  });
});
