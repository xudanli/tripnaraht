// src/kpu/services/__tests__/validation-scoring.service.spec.ts
/**
 * ValidationScoringService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ValidationScoringService } from '../validation-scoring.service';
import { ScoringFactors } from '../../types/validation.types';

describe('ValidationScoringService', () => {
  let service: ValidationScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidationScoringService],
    }).compile();

    service = module.get<ValidationScoringService>(ValidationScoringService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateOverallScore', () => {
    it('should return high score for all pass factors', () => {
      const factors: ScoringFactors = {
        factCheck: 'pass',
        credibility: 0.9,
        freshness: 0.9,
        completeness: 0.9,
        consistency: 'consistent',
        similarity: 0.9,
      };

      const score = service.calculateOverallScore(factors);
      expect(score).toBeGreaterThan(0.8);
      expect(score).toBeLessThanOrEqual(1.0);
    });

    it('should return low score for fail factors', () => {
      const factors: ScoringFactors = {
        factCheck: 'fail',
        credibility: 0.3,
        freshness: 0.3,
        completeness: 0.3,
        consistency: 'inconsistent',
        similarity: 0.3,
      };

      const score = service.calculateOverallScore(factors);
      expect(score).toBeLessThan(0.5);
      expect(score).toBeGreaterThanOrEqual(0.0);
    });

    it('should return medium score for unknown factors', () => {
      const factors: ScoringFactors = {
        factCheck: 'unknown',
        credibility: 0.5,
        freshness: 0.5,
        completeness: 0.5,
        consistency: 'unknown',
        similarity: 0.5,
      };

      const score = service.calculateOverallScore(factors);
      expect(score).toBeGreaterThan(0.4);
      expect(score).toBeLessThan(0.6);
    });

    it('should clamp score between 0 and 1', () => {
      const factors: ScoringFactors = {
        factCheck: 'pass',
        credibility: 2.0, // 超出范围
        freshness: -1.0, // 超出范围
        completeness: 0.5,
        consistency: 'consistent',
        similarity: 0.5,
      };

      const score = service.calculateOverallScore(factors);
      expect(score).toBeGreaterThanOrEqual(0.0);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate quality score correctly', () => {
      const factors: ScoringFactors = {
        factCheck: 'pass',
        credibility: 0.8,
        freshness: 0.7,
        completeness: 0.9,
        consistency: 'consistent',
        similarity: 0.5,
      };

      const score = service.calculateQualityScore(factors);
      // 质量得分 = credibility * 0.4 + freshness * 0.3 + completeness * 0.3
      // = 0.8 * 0.4 + 0.7 * 0.3 + 0.9 * 0.3 = 0.32 + 0.21 + 0.27 = 0.8
      expect(score).toBeCloseTo(0.8, 1);
    });
  });

  describe('calculateCredibilityScore', () => {
    it('should return credibility score', () => {
      const factors: ScoringFactors = {
        factCheck: 'pass',
        credibility: 0.85,
        freshness: 0.5,
        completeness: 0.5,
        consistency: 'consistent',
        similarity: 0.5,
      };

      const score = service.calculateCredibilityScore(factors);
      expect(score).toBe(0.85);
    });
  });
});
