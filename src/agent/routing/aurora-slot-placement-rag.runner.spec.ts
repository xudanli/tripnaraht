import { retrieveAuroraSlotPlacementRagSupplement } from './aurora-slot-placement-rag.runner';
import type { AuroraSlotPlacementRagHost } from './aurora-slot-placement-rag.host';

describe('aurora-slot-placement-rag.runner', () => {
  it('returns empty when ChunkRetrieval is missing', async () => {
    const host: AuroraSlotPlacementRagHost = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
      ragRealityPolicyGate: {
        resolve: () => ({ scope: 'full' as const, policy: {} }),
        mergeChunkRetrievalParams: (p) => p,
      },
      formatRagDocumentTitle: () => 'doc',
      buildLightweightDecisionContextForRealityGate: jest.fn(),
    };
    const result = await retrieveAuroraSlotPlacementRagSupplement(host, '极光');
    expect(result).toEqual({
      supplementZh: null,
      citationCount: 0,
      relevantCount: 0,
      usedStaticFallback: false,
    });
    expect(host.logger.debug).toHaveBeenCalled();
  });
});
