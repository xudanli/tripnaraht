import { Test } from '@nestjs/testing';
import { CognitiveMarketService } from './cognitive-market.service';
import { CognitiveAssetRegistryService } from './cognitive-asset-registry.service';
import { PolicyAgentPopulationService } from './policy-agent-population.service';
import { EcpsRuntimeBiasService } from './ecps-runtime-bias.service';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import { createBaselineExecutionPolicyIR } from '../utils/execution-policy.defaults';

describe('CognitiveMarketService', () => {
  it('importAssetToPolicy links registry borrow and optional population portfolio', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        CognitiveMarketService,
        CognitiveAssetRegistryService,
        PolicyAgentPopulationService,
        EcpsRuntimeBiasService,
      ],
    }).compile();
    await mod.init();

    const market = mod.get(CognitiveMarketService);
    const reg = mod.get(CognitiveAssetRegistryService);
    const pop = mod.get(PolicyAgentPopulationService);

    const aid = reg.register({
      type: 'tool_sequence',
      value: { tools: ['a'] },
      provenance: {},
      utilityScore: 0.8,
      sourcePolicyId: pop.getDefaultPolicyId() ?? undefined,
    });

    const dst = pop.registerFromIr(createBaselineExecutionPolicyIR(), {
      policyId: 'pa_dst_cel',
    });

    market.importAssetToPolicy({
      artifactId: aid,
      targetPolicyId: dst,
      utilityDelta: 0.5,
    });

    expect(pop.get(dst)?.cognitiveArtifactRefs).toContain(aid);

    await mod.close();
  });

  it('ingestExecutionTracesForAssets mints tool_sequence rows', async () => {
    const mod = await Test.createTestingModule({
      providers: [CognitiveMarketService, CognitiveAssetRegistryService],
    }).compile();
    const market = mod.get(CognitiveMarketService);

    const tr: ExecutionTrace = {
      traceId: 't',
      artifactId: 'art',
      decision: {
        mode: 'RECOMPUTE',
        kernel: 'REASONING_KERNEL',
        features: {
          intensity: 0.88,
          entropy: 0.55,
          determinism: 0.38,
          toolDepth: 'HIGH',
        },
        toolDepth: 'HIGH',
        reuseArtifact: false,
        invalidationScope: 'FULL',
        confidenceGate: 'LOW',
      },
      engine: 'SYSTEM2_REACT',
      steps: [
        {
          stepId: 's',
          type: 'TOOL_CALL',
          input: {},
          output: {},
          metadata: { toolName: 'search_places' },
        },
      ],
      provenance: {},
      confidence: {
        score: 0.5,
        band: 'LOW',
        factors: {
          eligibilityPrior: 0.5,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      anomalies: [],
      timestamp: 1,
    };

    const ids = market.ingestExecutionTracesForAssets({ traces: [tr], sourcePolicyId: 'pa_x' });
    expect(ids.length).toBe(1);

    await mod.close();
  });
});
