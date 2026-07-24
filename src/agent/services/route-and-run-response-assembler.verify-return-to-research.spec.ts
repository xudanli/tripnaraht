/**
 * VERIFY RETURN_TO_RESEARCH：observability 回显
 */

import { Test, TestingModule } from '@nestjs/testing';
import { RouteAndRunResponseAssemblerService } from './route-and-run-response-assembler.service';
import { JepaProjectorService } from './jepa-projector.service';
import { TradeoffEngineService } from './tradeoff-engine.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';

async function createAssembler(): Promise<RouteAndRunResponseAssemblerService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RouteAndRunResponseAssemblerService,
      JepaProjectorService,
      {
        provide: TradeoffEngineService,
        useValue: { buildNegotiation: jest.fn().mockResolvedValue(null) },
      },
    ],
  }).compile();
  return module.get(RouteAndRunResponseAssemblerService);
}

describe('RouteAndRunResponseAssemblerService — VERIFY RETURN_TO_RESEARCH observability', () => {
  it('resolveHarnessObservability surfaces retry count and invalidation reason', async () => {
    const assembler = await createAssembler();
    const orchestrationResult: OrchestrationResult = {
      success: true,
      answerText: 'ok',
      stepsExecuted: [],
      totalDuration: 0,
      decisionLog: [],
      result: {
        state: {
          metadata: {
            verify_return_to_research_count: 1,
            research_scope_invalidation: { reason: 'RETURN_TO_RESEARCH', scopes: ['hotel'] },
          },
        },
      } as OrchestrationResult['result'],
    };
    const request = { request_id: 'r1' } as RouteAndRunRequestDto;
    const obs = (
      assembler as unknown as {
        resolveHarnessObservability: (
          a: RouteAndRunRequestDto,
          b: OrchestrationResult,
        ) => Record<string, unknown>;
      }
    ).resolveHarnessObservability(request, orchestrationResult);

    expect(obs.verify_return_to_research_count).toBe(1);
    expect(obs.research_scope_invalidation_reason).toBe('RETURN_TO_RESEARCH');
  });
});
