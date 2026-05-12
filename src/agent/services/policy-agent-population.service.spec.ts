import { Test } from '@nestjs/testing';
import { PolicyAgentPopulationService } from './policy-agent-population.service';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import { compilePolicy } from '../utils/execution-policy.compiler';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('PolicyAgentPopulationService', () => {
  it('resolves pinned policy_agent_id', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PolicyAgentPopulationService, EcpsRuntimeBiasService],
    }).compile();
    await moduleRef.init();

    const pop = moduleRef.get(PolicyAgentPopulationService);
    const ir = compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const childId = pop.registerFromIr(ir, {
      policyId: 'pa_test_child',
      specialization: { primary: 'LOW_LATENCY', tags: ['LOW_LATENCY'] },
    });

    const ecpsCtx: ExecutionControlContext = {
      artifactId: 'a',
      replayConfidence: {
        score: 0.95,
        band: 'HIGH',
        factors: { eligibilityPrior: 1, anomalyPenalty: 0, timeDecayFactor: 1 },
      },
      replayEligibility: 'FULL',
      anomalies: [],
      freshness: {},
      provenance: {},
    };

    const resolved = pop.resolveForRequest({
      ecpsCtx,
      request: {
        request_id: 'r',
        user_id: 'u',
        message: 'm',
        options: { policy_agent_id: childId },
      } as RouteAndRunRequestDto,
    });

    expect(resolved.agent.policyId).toBe(childId);
    expect(resolved.pinned).toBe(true);

    await moduleRef.close();
  });
});
