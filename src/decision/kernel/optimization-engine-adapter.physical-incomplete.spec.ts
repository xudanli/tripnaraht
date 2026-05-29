import { Test, TestingModule } from '@nestjs/testing';
import { OptimizationEngineAdapterService } from './optimization-engine-adapter.service';
import type { DecisionState } from './decision-state.types';
import { RagRealityPolicyGateService } from '../../rag/services/rag-reality-policy-gate.service';

describe('OptimizationEngineAdapterService — physical incomplete gate', () => {
  let service: OptimizationEngineAdapterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OptimizationEngineAdapterService, RagRealityPolicyGateService],
    }).compile();
    service = module.get(OptimizationEngineAdapterService);
  });

  it('forces HEURISTIC when physicalRealityIncomplete and no plan draft', async () => {
    const state = {
      requestId: 'req-ph',
      userIntent: { destination: 'Iceland', days: 5 },
      environmentState: {
        countryCode: 'IS',
        physicalRealityIncomplete: true,
        routeDirectionId: 'rd-1',
      },
      tripState: {},
      systemState: { requestId: 'req-ph' },
    } as DecisionState;

    const hints = await service.getHintsAsync(state);

    expect(hints?.method).toBe('HEURISTIC');
    expect(hints?.optimizationFlags?.useMonteCarlo).toBe(false);
    expect(hints?.optimizationFlags?.freezeRouteSelection).toBe(true);
    expect(hints?.optimizationFlags?.physicalRealityIncomplete).toBe(true);
    expect(hints?.optimizationFlags?.relaxationFactor).toBe(1.5);
  });
});
