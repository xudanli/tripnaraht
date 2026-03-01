/**
 * LagrangianConstraintService 单元测试
 * 专利 3.13.5：L(a,λ) = U(a|b) − Σ λ_i g_i(s,a)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LagrangianConstraintService } from './lagrangian-constraint.service';

describe('LagrangianConstraintService', () => {
  let service: LagrangianConstraintService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LagrangianConstraintService],
    }).compile();
    service = module.get(LagrangianConstraintService);
  });

  it('应计算 L(a,λ) = U − Σ λ_i g_i', () => {
    const out = service.computeLagrangian(
      { utility: 0.8, constraints: [{ index: 0, type: 'g1', value: 0.1 }] },
      [1],
    );
    expect(out.lagrangianValue).toBeCloseTo(0.8 - 0.1, 4);
  });

  it('无违反时 L = U', () => {
    const out = service.computeLagrangian(
      { utility: 0.9, constraints: [{ index: 0, type: 'g1', value: 0 }] },
      [1],
    );
    expect(out.lagrangianValue).toBe(0.9);
  });
});
