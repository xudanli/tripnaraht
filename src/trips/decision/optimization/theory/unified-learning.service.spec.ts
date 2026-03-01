/**
 * UnifiedLearningService 单元测试
 * 专利 3.13.15：θ_{k+1} = θ_k − η ∇_θ L
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedLearningService } from './unified-learning.service';

describe('UnifiedLearningService', () => {
  let service: UnifiedLearningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UnifiedLearningService],
    }).compile();
    service = module.get(UnifiedLearningService);
  });

  it('应执行 θ_{k+1} = θ_k − η ∇L', () => {
    const out = service.updateParameters({
      theta: { w1: 0.5 },
      learningRate: 0.1,
      gradient: { w1: 1 },
    });
    expect(out.updated).toBe(true);
    expect(out.theta.w1).toBeCloseTo(0.4, 4);
  });

  it('无梯度时不更新', () => {
    const out = service.updateParameters({ theta: { w1: 0.5 } });
    expect(out.updated).toBe(false);
  });
});
