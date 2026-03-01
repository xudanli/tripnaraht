/**
 * RegretTrackerService 单元测试
 *
 * 专利 4.14.4：Regret(T) → 0，E[U(π*)−U(π_t)] ≤ O(1/√T)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RegretTrackerService } from './regret-tracker.service';

describe('RegretTrackerService', () => {
  let service: RegretTrackerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RegretTrackerService],
    }).compile();
    service = module.get<RegretTrackerService>(RegretTrackerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('应记录效用并计算累计 Regret', () => {
    service.recordUtility(1, 0.5);
    service.recordUtility(2, 0.8);
    service.recordUtility(3, 0.6);
    const regret = service.getCumulativeRegret(3);
    expect(regret).toBeGreaterThanOrEqual(0);
    expect(regret).toBeLessThanOrEqual(1);
  });

  it('理论界 O(1/√T) 应随 T 增大而减小', () => {
    const b1 = service.getTheoreticalBound(10);
    const b2 = service.getTheoreticalBound(100);
    const b3 = service.getTheoreticalBound(1000);
    expect(b1).toBeGreaterThan(b2);
    expect(b2).toBeGreaterThan(b3);
  });
});
