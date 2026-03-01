/**
 * ComplexityAnalysisService 单元测试
 *
 * 专利 4.14.2：Time Complexity = O(N·ρ·H)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ComplexityAnalysisService } from './complexity-analysis.service';

describe('ComplexityAnalysisService', () => {
  let service: ComplexityAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComplexityAnalysisService],
    }).compile();
    service = module.get<ComplexityAnalysisService>(ComplexityAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('应输出 O(N·ρ·H) 复杂度报告', () => {
    const report = service.estimateComplexity(100, 20, 3);
    expect(report.nCandidates).toBe(100);
    expect(report.nFeasible).toBe(20);
    expect(report.rho).toBe(0.2);
    expect(report.horizon).toBe(3);
    expect(report.complexityClass).toBe('O(N·ρ·H)');
    expect(report.estimatedOps).toBeGreaterThan(0);
  });

  it('当 ρ≪1 时 estimatedOps 应显著小于 N*H', () => {
    const report = service.estimateComplexity(1000, 50, 5);
    expect(report.rho).toBe(0.05);
    expect(report.estimatedOps).toBeLessThan(1000 * 5);
  });
});
