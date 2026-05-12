import { Test } from '@nestjs/testing';
import { CognitiveAssetRegistryService } from './cognitive-asset-registry.service';

describe('CognitiveAssetRegistryService', () => {
  it('registers and records borrow', async () => {
    const mod = await Test.createTestingModule({
      providers: [CognitiveAssetRegistryService],
    }).compile();
    const reg = mod.get(CognitiveAssetRegistryService);

    const id = reg.register({
      type: 'replay_strategy',
      value: { gate: 'HIGH' },
      provenance: { generatedAt: Date.now() },
      utilityScore: 0.9,
      sourcePolicyId: 'pa_src',
    });

    expect(reg.get(id)?.utilityScore).toBe(0.9);
    reg.recordBorrow(id, 'pa_dst');
    expect(reg.get(id)?.borrowedByPolicyIds).toContain('pa_dst');
    expect(reg.get(id)?.usageCount).toBe(1);

    await mod.close();
  });
});
