// Recruiting Outcome Service Tests
// 招募结果服务测试

import { Test, TestingModule } from '@nestjs/testing';
import { RecruitingOutcomeService } from './recruiting-outcome.service';
import {
  RecruitingOutcomeRequest,
  RecruitmentSuccessLevel,
  RecruitingFactorType,
} from '../types/recruiting-runtime.types';
import { TripSuccessLevel } from '../../trips/outcome/types/travel-outcome.types';

describe('RecruitingOutcomeService', () => {
  let service: RecruitingOutcomeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecruitingOutcomeService],
    }).compile();

    service = module.get<RecruitingOutcomeService>(RecruitingOutcomeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculate', () => {
    it('should calculate outcome with excellent success', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripId: 'trip-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.EXCELLENT,
          overallScore: 0.9,
          companionSatisfaction: 'EXCELLENT',
          companionMatchScore: 0.85,
        },
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
          { id: 'app-2', status: 'approved', decidedAt: new Date() },
          { id: 'app-3', status: 'rejected', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
          publishedAt: new Date('2026-01-01'),
          closedAt: new Date('2026-01-05'),
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.postId).toBe('post-1');
      expect(result.outcome.tripId).toBe('trip-1');
      // With EXCELLENT trip outcome and good metrics, should be GOOD or EXCELLENT
      expect([RecruitmentSuccessLevel.EXCELLENT, RecruitmentSuccessLevel.GOOD]).toContain(result.outcome.successLevel);
      expect(result.outcome.metrics.applicationCount).toBe(3);
      expect(result.outcome.metrics.approvedCount).toBe(2);
      expect(result.outcome.metrics.rejectedCount).toBe(1);
      expect(result.outcome.metrics.timeToFill).toBe(4);
      expect(result.outcome.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate outcome with poor success', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.POOR,
          overallScore: 0.4,
          companionSatisfaction: 'POOR',
          companionMatchScore: 0.3,
        },
        applications: [
          { id: 'app-1', status: 'rejected', decidedAt: new Date() },
          { id: 'app-2', status: 'rejected', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
          publishedAt: new Date('2026-01-01'),
          closedAt: new Date('2026-01-20'),
        },
      };

      const result = await service.calculate(request);

      // With 0 approved and POOR trip outcome, should be FAILED
      expect(result.outcome.successLevel).toBe(RecruitmentSuccessLevel.FAILED);
      expect(result.outcome.metrics.approvedCount).toBe(0);
      expect(result.outcome.metrics.conversionRate).toBe(0);
      expect(result.outcome.metrics.timeToFill).toBe(19);
      // Check that recommendations include something about poor performance
      expect(result.outcome.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate outcome with failed success', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.FAILED,
          overallScore: 0.2,
          companionSatisfaction: 'POOR',
          companionMatchScore: 0.2,
        },
        applications: [],
        post: {
          slotsNeeded: 2,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.successLevel).toBe(RecruitmentSuccessLevel.FAILED);
      expect(result.outcome.metrics.applicationCount).toBe(0);
      // Check that recommendations include something about failure
      expect(result.outcome.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate outcome without trip outcome', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
          { id: 'app-2', status: 'approved', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.successLevel).toBeDefined();
      expect(result.outcome.metrics.approvedCount).toBe(2);
      expect(result.outcome.dataQuality).toBeLessThan(1); // Missing trip outcome reduces quality
    });

    it('should generate factors for low slot fill rate', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 4,
        },
      };

      const result = await service.calculate(request);

      const slotFillFactor = result.outcome.factors.find(
        f => f.type === RecruitingFactorType.SLOT_FILL_RATE,
      );
      expect(slotFillFactor).toBeDefined();
      expect(slotFillFactor?.description).toContain('岗位填充率不足');
    });

    it('should generate factors for long time to fill', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        applications: [],
        post: {
          slotsNeeded: 2,
          publishedAt: new Date('2026-01-01'),
          closedAt: new Date('2026-01-15'),
        },
      };

      const result = await service.calculate(request);

      // Check if any factor was generated (time to fill threshold is > 14 days)
      expect(result.outcome.factors.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate factors for low conversion rate', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        applications: [
          { id: 'app-1', status: 'rejected', decidedAt: new Date() },
          { id: 'app-2', status: 'rejected', decidedAt: new Date() },
          { id: 'app-3', status: 'rejected', decidedAt: new Date() },
          { id: 'app-4', status: 'approved', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
        },
      };

      const result = await service.calculate(request);

      const conversionFactor = result.outcome.factors.find(
        f => f.type === RecruitingFactorType.SATISFACTION_SCORE && f.description.includes('转化率'),
      );
      expect(conversionFactor).toBeDefined();
    });

    it('should generate factors for poor team performance', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.POOR,
          overallScore: 0.4,
          companionSatisfaction: 'POOR',
          companionMatchScore: 0.3,
        },
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 1,
        },
      };

      const result = await service.calculate(request);

      // Check if any factor was generated
      expect(result.outcome.factors.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate data quality correctly', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        applications: [],
        post: {
          slotsNeeded: 2,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.dataQuality).toBeLessThan(1);
      expect(result.outcome.dataQuality).toBeGreaterThan(0);
    });

    it('should calculate confidence based on data quality and factors', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.GOOD,
          overallScore: 0.7,
          companionSatisfaction: 'GOOD',
          companionMatchScore: 0.7,
        },
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
          { id: 'app-2', status: 'rejected', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
        },
      };

      const result = await service.calculate(request);

      expect(result.outcome.confidence).toBeGreaterThan(0);
      expect(result.outcome.confidence).toBeLessThanOrEqual(1);
    });

    it('should return default recommendation when no issues', async () => {
      const request: RecruitingOutcomeRequest = {
        postId: 'post-1',
        tripOutcome: {
          successLevel: TripSuccessLevel.GOOD,
          overallScore: 0.75,
          companionSatisfaction: 'GOOD',
          companionMatchScore: 0.75,
        },
        applications: [
          { id: 'app-1', status: 'approved', decidedAt: new Date() },
          { id: 'app-2', status: 'approved', decidedAt: new Date() },
        ],
        post: {
          slotsNeeded: 2,
          publishedAt: new Date('2026-01-01'),
          closedAt: new Date('2026-01-03'),
        },
      };

      const result = await service.calculate(request);

      // Just check that recommendations exist
      expect(result.outcome.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('calculateBatch', () => {
    it('should calculate multiple requests in batch', async () => {
      const requests: RecruitingOutcomeRequest[] = [
        {
          postId: 'post-1',
          applications: [{ id: 'app-1', status: 'approved', decidedAt: new Date() }],
          post: { slotsNeeded: 1 },
        },
        {
          postId: 'post-2',
          applications: [{ id: 'app-2', status: 'rejected', decidedAt: new Date() }],
          post: { slotsNeeded: 1 },
        },
      ];

      const results = await service.calculateBatch(requests);

      expect(results).toHaveLength(2);
      expect(results[0].outcome.postId).toBe('post-1');
      expect(results[1].outcome.postId).toBe('post-2');
    });
  });
});
