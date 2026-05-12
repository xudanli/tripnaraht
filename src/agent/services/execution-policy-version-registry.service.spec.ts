import { Test } from '@nestjs/testing';
import { ExecutionPolicyVersionRegistryService } from './execution-policy-version-registry.service';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import { compilePolicy } from '../utils/execution-policy.compiler';
import { DEFAULT_ECPS_RUNTIME_BIAS } from '../contracts/policy-correction.types';
import type { ExecutionControlContext } from '../contracts/execution-control-policy.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('ExecutionPolicyVersionRegistryService', () => {
  it('seeds baseline on init and resolves pinned explicit version', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ExecutionPolicyVersionRegistryService, EcpsRuntimeBiasService],
    }).compile();
    await moduleRef.init();

    const reg = moduleRef.get(ExecutionPolicyVersionRegistryService);
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

    const ir = compilePolicy([], DEFAULT_ECPS_RUNTIME_BIAS, {});
    const expId = reg.commitIr(ir, { labels: ['experiment'], active: true });

    const resolved = reg.resolveForRequest({
      ecpsCtx,
      request: {
        request_id: 'r',
        user_id: 'u',
        message: 'm',
        options: { execution_policy_version_id: expId },
      } as RouteAndRunRequestDto,
    });

    expect(resolved.version.versionId).toBe(expId);
    expect(resolved.pinned).toBe(true);

    await moduleRef.close();
  });
});
