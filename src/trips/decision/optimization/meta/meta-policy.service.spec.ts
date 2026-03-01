/**
 * MetaPolicyService 单元测试
 * 专利 3.12.3：MetaPolicy 选择 H、N、strategy
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MetaPolicyService } from './meta-policy.service';
import type { DecisionState } from '../../../../decision/kernel/decision-state.types';

function createDSO(overrides: Partial<DecisionState> = {}): DecisionState {
  return {
    userIntent: {},
    tripState: {},
    environmentState: {},
    systemState: { requestId: 'req1', currentPhase: 'OPTIMIZE' },
    ...overrides,
  } as DecisionState;
}

describe('MetaPolicyService', () => {
  let service: MetaPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaPolicyService],
    }).compile();

    service = module.get(MetaPolicyService);
  });

  it('lowPowerMode 应输出 sampleSize=50, strategy=CGUS', () => {
    const out = service.selectPolicy(createDSO(), { lowPowerMode: true });
    expect(out.sampleSize).toBe(50);
    expect(out.strategy).toBe('CGUS');
    expect(out.horizon).toBe(1);
  });

  it('高不确定性应输出 sampleSize>=500', () => {
    const out = service.selectPolicy(
      createDSO({ environmentState: { weatherRisk: 0.7 } }),
    );
    expect(out.sampleSize).toBe(500);
    expect(out.useExploration).toBe(true);
  });

  it('无约束时应返回有效配置', () => {
    const out = service.selectPolicy(createDSO());
    expect(out.horizon).toBeGreaterThanOrEqual(1);
    expect(out.sampleSize).toBeGreaterThanOrEqual(50);
    expect(['CGUS', 'MPC', 'HYBRID']).toContain(out.strategy);
  });
});
