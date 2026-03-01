/**
 * LyapunovStabilityService 单元测试
 * 专利 3.13.14：V_k = E[U* − U(π_k)]
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LyapunovStabilityService } from './lyapunov-stability.service';

describe('LyapunovStabilityService', () => {
  let service: LyapunovStabilityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LyapunovStabilityService],
    }).compile();
    service = module.get(LyapunovStabilityService);
  });

  it('应计算 V_k = U* − U(π_k)', () => {
    const v = service.computeLyapunov({ optimalUtility: 1, currentUtility: 0.7 });
    expect(v).toBeCloseTo(0.3, 4);
  });

  it('V 递减应满足稳定性', () => {
    expect(service.checkStability(0.2, 0.3)).toBe(true);
    expect(service.checkStability(0.4, 0.3)).toBe(false);
  });
});
