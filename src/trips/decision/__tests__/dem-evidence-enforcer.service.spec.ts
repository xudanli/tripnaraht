// src/trips/decision/__tests__/dem-evidence-enforcer.service.spec.ts

/**
 * DEM Evidence Enforcer Service 单元测试
 * 
 * 测试强制规则：
 * 1. 没有 DEM evidence → plan 不可 finalize
 * 2. Neptune 不允许修复没有 DEM evidence 的 segment
 * 3. Abu 不允许忽略 HARD violation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DemEvidenceEnforcerService } from '../services/dem-evidence-enforcer.service';
import {
  DemEvidencePipelineResult,
  DemDecisionEvidence,
} from '../interfaces/dem-decision-evidence.interface';

describe('DemEvidenceEnforcerService', () => {
  let service: DemEvidenceEnforcerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DemEvidenceEnforcerService],
    }).compile();

    service = module.get<DemEvidenceEnforcerService>(DemEvidenceEnforcerService);
  });

  describe('canFinalizePlan', () => {
    it('should prevent finalize when no DEM evidence', () => {
      const emptyResult: DemEvidencePipelineResult = {
        segmentEvidences: [],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: false,
      };

      const result = service.canFinalizePlan(emptyResult);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('缺少 DEM 证据');
    });

    it('should prevent finalize when HARD violation exists', () => {
      const resultWithHardViolation: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 1000,
            maxSlopePct: 30,
            rollingAscent3Days: 0,
            fatigueIndex: 50,
            violation: 'HARD',
            explanation: '海拔超过限制：5500m > 5000m',
          },
        ],
        hasHardViolation: true,
        hasSoftViolation: false,
        canProceed: false,
      };

      const result = service.canFinalizePlan(resultWithHardViolation);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('硬约束违规');
    });

    it('should allow finalize when only SOFT violations exist', () => {
      const resultWithSoftViolation: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 800,
            maxSlopePct: 20,
            rollingAscent3Days: 0,
            fatigueIndex: 40,
            violation: 'SOFT',
            explanation: '累计爬升略高，建议拆分',
          },
        ],
        hasHardViolation: false,
        hasSoftViolation: true,
        canProceed: true,
      };

      const result = service.canFinalizePlan(resultWithSoftViolation);
      expect(result.allowed).toBe(true);
    });

    it('should allow finalize when no violations', () => {
      const cleanResult: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 500,
            maxSlopePct: 15,
            rollingAscent3Days: 0,
            fatigueIndex: 25,
            violation: 'NONE',
            explanation: '无违规',
          },
        ],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const result = service.canFinalizePlan(cleanResult);
      expect(result.allowed).toBe(true);
    });
  });

  describe('canNeptuneRepairSegment', () => {
    it('should prevent Neptune from repairing segment without evidence', () => {
      const result: DemEvidencePipelineResult = {
        segmentEvidences: [],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const canRepair = service.canNeptuneRepairSegment('day-1', result);
      expect(canRepair.allowed).toBe(false);
      expect(canRepair.reason).toContain('没有 DEM 证据');
    });

    it('should allow Neptune to repair segment with evidence', () => {
      const evidence: DemDecisionEvidence = {
        segmentId: 'day-1',
        elevationProfile: [],
        cumulativeAscent: 500,
        maxSlopePct: 15,
        rollingAscent3Days: 0,
        fatigueIndex: 25,
        violation: 'NONE',
        explanation: '无违规',
      };

      const result: DemEvidencePipelineResult = {
        segmentEvidences: [evidence],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const canRepair = service.canNeptuneRepairSegment('day-1', result);
      expect(canRepair.allowed).toBe(true);
      expect(canRepair.evidence).toEqual(evidence);
    });

    it('should prevent Neptune from repairing non-existent segment', () => {
      const result: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-2',
            elevationProfile: [],
            cumulativeAscent: 500,
            maxSlopePct: 15,
            rollingAscent3Days: 0,
            fatigueIndex: 25,
            violation: 'NONE',
            explanation: '无违规',
          },
        ],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const canRepair = service.canNeptuneRepairSegment('day-1', result);
      expect(canRepair.allowed).toBe(false);
      expect(canRepair.reason).toContain('没有 DEM 证据');
    });
  });

  describe('canAbuIgnoreViolation', () => {
    it('should prevent Abu from ignoring HARD violation', () => {
      const evidence: DemDecisionEvidence = {
        segmentId: 'day-1',
        elevationProfile: [],
        cumulativeAscent: 1000,
        maxSlopePct: 30,
        rollingAscent3Days: 0,
        fatigueIndex: 50,
        violation: 'HARD',
        explanation: '海拔超过限制：5500m > 5000m',
      };

      const result: DemEvidencePipelineResult = {
        segmentEvidences: [evidence],
        hasHardViolation: true,
        hasSoftViolation: false,
        canProceed: false,
      };

      const canIgnore = service.canAbuIgnoreViolation('day-1', result);
      expect(canIgnore.allowed).toBe(false);
      expect(canIgnore.reason).toContain('HARD violation');
      expect(canIgnore.evidence).toEqual(evidence);
    });

    it('should allow Abu to ignore SOFT violation', () => {
      const evidence: DemDecisionEvidence = {
        segmentId: 'day-1',
        elevationProfile: [],
        cumulativeAscent: 800,
        maxSlopePct: 20,
        rollingAscent3Days: 0,
        fatigueIndex: 40,
        violation: 'SOFT',
        explanation: '累计爬升略高，建议拆分',
      };

      const result: DemEvidencePipelineResult = {
        segmentEvidences: [evidence],
        hasHardViolation: false,
        hasSoftViolation: true,
        canProceed: true,
      };

      const canIgnore = service.canAbuIgnoreViolation('day-1', result);
      expect(canIgnore.allowed).toBe(true);
      expect(canIgnore.evidence).toEqual(evidence);
    });

    it('should prevent Abu from ignoring when no evidence exists', () => {
      const result: DemEvidencePipelineResult = {
        segmentEvidences: [],
        hasHardViolation: false,
        hasSoftViolation: false,
        canProceed: true,
      };

      const canIgnore = service.canAbuIgnoreViolation('day-1', result);
      expect(canIgnore.allowed).toBe(false);
      expect(canIgnore.reason).toContain('没有 DEM 证据');
    });
  });

  describe('getSegmentsRequiringRepair', () => {
    it('should return only HARD violation segments', () => {
      const result: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 1000,
            maxSlopePct: 30,
            rollingAscent3Days: 0,
            fatigueIndex: 50,
            violation: 'HARD',
            explanation: '海拔超过限制',
          },
          {
            segmentId: 'day-2',
            elevationProfile: [],
            cumulativeAscent: 800,
            maxSlopePct: 20,
            rollingAscent3Days: 0,
            fatigueIndex: 40,
            violation: 'SOFT',
            explanation: '累计爬升略高',
          },
          {
            segmentId: 'day-3',
            elevationProfile: [],
            cumulativeAscent: 500,
            maxSlopePct: 15,
            rollingAscent3Days: 0,
            fatigueIndex: 25,
            violation: 'NONE',
            explanation: '无违规',
          },
        ],
        hasHardViolation: true,
        hasSoftViolation: true,
        canProceed: false,
      };

      const segments = service.getSegmentsRequiringRepair(result);
      expect(segments.length).toBe(1);
      expect(segments[0].segmentId).toBe('day-1');
      expect(segments[0].violation).toBe('HARD');
    });
  });

  describe('getSegmentsSuggestingOptimization', () => {
    it('should return only SOFT violation segments', () => {
      const result: DemEvidencePipelineResult = {
        segmentEvidences: [
          {
            segmentId: 'day-1',
            elevationProfile: [],
            cumulativeAscent: 1000,
            maxSlopePct: 30,
            rollingAscent3Days: 0,
            fatigueIndex: 50,
            violation: 'HARD',
            explanation: '海拔超过限制',
          },
          {
            segmentId: 'day-2',
            elevationProfile: [],
            cumulativeAscent: 800,
            maxSlopePct: 20,
            rollingAscent3Days: 0,
            fatigueIndex: 40,
            violation: 'SOFT',
            explanation: '累计爬升略高',
          },
          {
            segmentId: 'day-3',
            elevationProfile: [],
            cumulativeAscent: 500,
            maxSlopePct: 15,
            rollingAscent3Days: 0,
            fatigueIndex: 25,
            violation: 'NONE',
            explanation: '无违规',
          },
        ],
        hasHardViolation: true,
        hasSoftViolation: true,
        canProceed: false,
      };

      const segments = service.getSegmentsSuggestingOptimization(result);
      expect(segments.length).toBe(1);
      expect(segments[0].segmentId).toBe('day-2');
      expect(segments[0].violation).toBe('SOFT');
    });
  });
});

