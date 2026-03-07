/**
 * DSOStabilityMonitorService 单元测试
 *
 * 专利 4.14.3：V(DSO_t) ≤ V(DSO_{t−1})
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DSOStabilityMonitorService } from './dso-stability.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

function createDSO(version: number, feasible: boolean): DecisionState {
  return {
    userIntent: {},
    tripState: {},
    environmentState: {},
    systemState: {
      requestId: 'req-1',
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      version,
    },
    requestId: 'req-1',
    constraints: feasible
      ? { feasible: true }
      : { feasible: false, violations: [{ type: 'BUDGET', severity: 'HARD', degree: 1 }] },
  };
}

describe('DSOStabilityMonitorService', () => {
  let service: DSOStabilityMonitorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DSOStabilityMonitorService],
    }).compile();
    service = module.get<DSOStabilityMonitorService>(DSOStabilityMonitorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('应计算 V(dso) = 1 - consistencyScore', () => {
    const dso = createDSO(1, true);
    const v = service.computeDSOLyapunov(dso, dso);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('checkStability: V_new ≤ V_prev 应返回 true', () => {
    expect(service.checkStability(0.2, 0.3)).toBe(true);
  });

  it('checkStability: V_new > V_prev 应返回 false', () => {
    expect(service.checkStability(0.4, 0.3)).toBe(false);
  });

  it('checkStrictStability: ΔV ≤ −ε 应返回 true', () => {
    expect(service.checkStrictStability(0.2, 0.3, 0.1)).toBe(true);
  });

  it('checkStrictStability: ΔV > −ε 应返回 false', () => {
    expect(service.checkStrictStability(0.25, 0.3, 0.1)).toBe(false);
  });

  it('版本回退时 V 应增加（prev 真实验证）', () => {
    const prev = createDSO(2, true);
    const curr = createDSO(1, true); // version 回退
    const vPrev = service.computeDSOLyapunov(prev, prev);
    const vCurr = service.computeDSOLyapunov(prev, curr);
    expect(vCurr).toBeGreaterThan(vPrev);
  });

  it('约束退化时 V 应增加', () => {
    const prev = createDSO(1, true);
    const curr = createDSO(2, false); // feasible → infeasible
    const vPrev = service.computeDSOLyapunov(prev, prev);
    const vCurr = service.computeDSOLyapunov(prev, curr);
    expect(vCurr).toBeGreaterThan(vPrev);
  });
});
