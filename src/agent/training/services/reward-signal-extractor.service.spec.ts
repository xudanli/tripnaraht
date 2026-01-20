// src/agent/training/services/reward-signal-extractor.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RewardSignalExtractorService } from './reward-signal-extractor.service';
import { ApprovalStatus } from '@prisma/client';
import { ExecutionResult } from '../interfaces/trajectory.interface';

describe('RewardSignalExtractorService', () => {
  let service: RewardSignalExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RewardSignalExtractorService],
    }).compile();

    service = module.get<RewardSignalExtractorService>(
      RewardSignalExtractorService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractFromApproval', () => {
    it('should extract positive reward for APPROVED', () => {
      const signals = service.extractFromApproval(ApprovalStatus.APPROVED);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('USER_APPROVAL');
      expect(signals[0].value).toBe(1.0);
      expect(signals[0].metadata?.approval_status).toBe('APPROVED');
    });

    it('should extract negative reward for REJECTED', () => {
      const signals = service.extractFromApproval(ApprovalStatus.REJECTED);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('USER_APPROVAL');
      expect(signals[0].value).toBe(-0.5);
      expect(signals[0].metadata?.approval_status).toBe('REJECTED');
    });

    it('should return empty array for PENDING', () => {
      const signals = service.extractFromApproval(ApprovalStatus.PENDING);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFromExecution', () => {
    it('should extract positive reward for successful execution', () => {
      const executionResult: ExecutionResult = { success: true };
      const signals = service.extractFromExecution(executionResult);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('EXECUTION_SUCCESS');
      expect(signals[0].value).toBe(0.8);
      expect(signals[0].metadata?.execution_success).toBe(true);
    });

    it('should extract negative reward for failed execution', () => {
      const executionResult: ExecutionResult = {
        success: false,
        error: 'Test error',
      };
      const signals = service.extractFromExecution(executionResult);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('EXECUTION_FAILURE');
      expect(signals[0].value).toBe(-0.3);
      expect(signals[0].metadata?.execution_success).toBe(false);
    });
  });

  describe('extractFromPlanCommit', () => {
    it('should extract reward for successful commit', () => {
      const signals = service.extractFromPlanCommit(true);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('PLAN_COMMIT');
      expect(signals[0].value).toBe(0.8);
    });

    it('should return empty array for failed commit', () => {
      const signals = service.extractFromPlanCommit(false);
      expect(signals).toHaveLength(0);
    });
  });

  describe('extractFromAlignmentScore', () => {
    it('should extract reward based on alignment score', () => {
      const signals = service.extractFromAlignmentScore(0.8);
      expect(signals).toHaveLength(1);
      expect(signals[0].type).toBe('DECISION_ALIGNMENT');
      expect(signals[0].value).toBe(0.8);
      expect(signals[0].metadata?.alignment_score).toBe(0.8);
    });

    it('should clamp score to 0-1 range', () => {
      const signalsHigh = service.extractFromAlignmentScore(1.5);
      expect(signalsHigh[0].value).toBe(1.0);

      const signalsLow = service.extractFromAlignmentScore(-0.5);
      expect(signalsLow[0].value).toBe(0.0);
    });
  });

  describe('calculateTotalReward', () => {
    it('should calculate total reward correctly', () => {
      const signals = [
        { type: 'USER_APPROVAL' as const, value: 1.0, timestamp: '2026-01-20T00:00:00Z' },
        { type: 'EXECUTION_SUCCESS' as const, value: 0.8, timestamp: '2026-01-20T00:00:00Z' },
      ];
      const total = service.calculateTotalReward(signals);
      expect(total).toBe(1.8);
    });

    it('should handle negative rewards', () => {
      const signals = [
        { type: 'USER_APPROVAL' as const, value: 1.0, timestamp: '2026-01-20T00:00:00Z' },
        { type: 'USER_APPROVAL' as const, value: -0.5, timestamp: '2026-01-20T00:00:00Z' },
      ];
      const total = service.calculateTotalReward(signals);
      expect(total).toBe(0.5);
    });
  });

  describe('mergeSignals', () => {
    it('should merge multiple signal arrays', () => {
      const signals1 = [
        { type: 'USER_APPROVAL' as const, value: 1.0, timestamp: '2026-01-20T00:00:00Z' },
      ];
      const signals2 = [
        { type: 'EXECUTION_SUCCESS' as const, value: 0.8, timestamp: '2026-01-20T00:00:00Z' },
      ];
      const merged = service.mergeSignals(signals1, signals2);
      expect(merged).toHaveLength(2);
      expect(merged[0].type).toBe('USER_APPROVAL');
      expect(merged[1].type).toBe('EXECUTION_SUCCESS');
    });
  });
});
