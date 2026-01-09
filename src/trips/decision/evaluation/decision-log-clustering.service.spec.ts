// src/trips/decision/evaluation/decision-log-clustering.service.spec.ts
/**
 * Decision Log Clustering Service 测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionLogClusteringService } from './decision-log-clustering.service';
import { DecisionLogStorageService } from '../services/decision-log-storage.service';
import { DecisionLogEntry } from '../shared/decision-result.types';

describe('DecisionLogClusteringService', () => {
  let service: DecisionLogClusteringService;
  let logStorage: jest.Mocked<DecisionLogStorageService>;

  beforeEach(async () => {
    const mockLogStorage = {
      queryLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecisionLogClusteringService,
        {
          provide: DecisionLogStorageService,
          useValue: mockLogStorage,
        },
      ],
    }).compile();

    service = module.get<DecisionLogClusteringService>(DecisionLogClusteringService);
    logStorage = module.get(DecisionLogStorageService);
  });

  describe('analyzeRejectionReasons', () => {
    it('应该能够分析最常见的拒绝原因', async () => {
      // Mock 日志数据
      const mockLogs: DecisionLogEntry[] = [
        {
          persona: 'ABU',
          action: 'REJECT',
          explanation: 'DEM 硬违规',
          reasonCodes: ['E_DEM_MISSING'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'ABU_GATE',
        },
        {
          persona: 'ABU',
          action: 'REJECT',
          explanation: 'DEM 硬违规',
          reasonCodes: ['E_DEM_MISSING'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'DEM_EVIDENCE',
        },
        {
          persona: 'ABU',
          action: 'REJECT',
          explanation: '合规硬违规',
          reasonCodes: ['HARD_COMPLIANCE_VIOLATION'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'ABU_GATE',
        },
      ];

      logStorage.queryLogs.mockResolvedValue(mockLogs);

      const results = await service.analyzeRejectionReasons({});

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].reasonCode).toBe('E_DEM_MISSING');
      expect(results[0].count).toBe(2);
      expect(results[0].percentage).toBeGreaterThan(0);
    });
  });

  describe('analyzeReplacementReasons', () => {
    it('应该能够分析最常见的替换原因', async () => {
      const mockLogs: DecisionLogEntry[] = [
        {
          persona: 'NEPTUNE',
          action: 'REPLACE',
          explanation: '空间替换',
          reasonCodes: ['SPATIAL_REPLACEMENT', 'ENTRY'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'SPATIAL_REPAIR',
        },
      ];

      logStorage.queryLogs.mockResolvedValue(mockLogs);

      const results = await service.analyzeReplacementReasons({});

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].replacementType).toBe('SPATIAL_REPLACEMENT');
    });
  });

  describe('generateQualityReport', () => {
    it('应该能够生成决策质量报告', async () => {
      const mockLogs: DecisionLogEntry[] = [
        {
          persona: 'ABU',
          action: 'REJECT',
          explanation: 'DEM 缺失',
          reasonCodes: ['E_DEM_MISSING'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'ABU_GATE',
        },
        {
          persona: 'NEPTUNE',
          action: 'REPLACE',
          explanation: '空间替换',
          reasonCodes: ['SPATIAL_REPLACEMENT'],
          evidenceRefs: [],
          timestamp: new Date().toISOString(),
          decisionSource: 'PHYSICAL',
          decisionStage: 'SPATIAL_REPAIR',
        },
      ];

      logStorage.queryLogs.mockResolvedValue(mockLogs);

      const report = await service.generateQualityReport({});

      expect(report).toBeDefined();
      expect(report.totalLogs).toBe(2);
      expect(report.topRejectionReasons.length).toBeGreaterThan(0);
      expect(report.topReplacementReasons.length).toBeGreaterThan(0);
      expect(report.qualityMetrics.rejectionRate).toBeGreaterThanOrEqual(0);
      expect(report.qualityMetrics.replacementRate).toBeGreaterThanOrEqual(0);
    });
  });
});
