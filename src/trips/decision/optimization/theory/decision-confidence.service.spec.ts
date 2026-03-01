/**
 * DecisionConfidenceService 单元测试
 * 专利 3.13.9：Confidence = 1 − Var/Var_max，C = P(U ≥ τ)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DecisionConfidenceService } from './decision-confidence.service';

describe('DecisionConfidenceService', () => {
  let service: DecisionConfidenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecisionConfidenceService],
    }).compile();
    service = module.get(DecisionConfidenceService);
  });

  it('方差形式：低方差应得高置信度', () => {
    const c = service.computeConfidenceVariance(0.01);
    expect(c).toBeGreaterThan(0.9);
  });

  it('概率形式：P(U≥τ)', () => {
    const c = service.computeConfidenceProbability([0.5, 0.6, 0.7, 0.8], 0.6);
    expect(c).toBe(0.75);
  });
});
