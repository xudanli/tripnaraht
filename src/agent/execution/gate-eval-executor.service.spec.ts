/**
 * GateEvalExecutorService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { GateEvalExecutorService } from './gate-eval-executor.service';
import { TripContextExtractorService } from './shared/trip-context-extractor.service';

describe('GateEvalExecutorService', () => {
  let service: GateEvalExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GateEvalExecutorService,
        TripContextExtractorService,
      ],
    }).compile();
    service = module.get<GateEvalExecutorService>(GateEvalExecutorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('无 tripPlanRequest 时应返回默认 ALLOW', async () => {
    const result = await service.execute({} as any, { requestId: 'r1' });
    expect(result.constraints.feasible).toBe(true);
    expect(result.gateResult.gate_result).toBe('ALLOW');
  });

  it('researchData 含高风险预测且 routeDirectionId 时应添加 BLOCK', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        routeDirectionId: 'rd-1',
        tripPlanRequest: { destination: 'Iceland' },
        researchData: {
          failure_risk_prediction: {
            predictions: [{ day: 2, riskLevel: 'HIGH' }, { day: 3, riskLevel: 'LOW' }],
          },
        },
      },
    );
    expect(result.gateResult.gate_result).toBe('BLOCK');
    expect(result.constraints.feasible).toBe(false);
    expect(result.gateResult.violations.some((v) => v.detail?.includes('高风险'))).toBe(true);
  });

  it('无 gatekeeperAgent 且无 blocker 时应返回默认 ALLOW', async () => {
    const result = await service.execute(
      {} as any,
      {
        requestId: 'r1',
        tripPlanRequest: { destination: 'Iceland', date_range: { start_date: '2026-06-01', end_date: '2026-06-05' } },
        researchData: {},
      },
    );
    expect(result.gateResult.gate_result).toBe('ALLOW');
  });
});
