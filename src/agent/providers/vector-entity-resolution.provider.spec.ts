import { VectorEntityResolutionProvider } from './vector-entity-resolution.provider';
import type { EmbeddingService } from '../../places/services/embedding.service';

describe('VectorEntityResolutionProvider', () => {
  it('searchTopNCandidates 向量命中冰岛相关实体', async () => {
    const embeddingService = {
      generateEmbedding: jest.fn(async (text: string) => {
        if (text.includes('秘境') || text.includes('西峡湾')) return [0.9, 0.1, 0];
        return [1, 0, 0];
      }),
    } as unknown as EmbeddingService;

    const provider = new VectorEntityResolutionProvider(embeddingService);
    (provider as unknown as { index: unknown[]; indexReady: boolean }).index = [
      { label: '冰岛', kind: 'destination', embedding: [1, 0, 0] },
      { label: '西峡湾', kind: 'destination', embedding: [0.88, 0.12, 0] },
      { label: '东京', kind: 'destination', embedding: [0, 1, 0] },
    ];
    (provider as unknown as { indexReady: boolean }).indexReady = true;

    const hits = await provider.searchTopNCandidates('类似冰岛西峡湾那种冷门秘境', 3, 0.6);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].label).toMatch(/冰岛|西峡湾/);
    expect(hits[0].score).toBeGreaterThanOrEqual(0.6);
  });

  it('embedding 不可用时返回空数组（触发子串降级）', async () => {
    const provider = new VectorEntityResolutionProvider(undefined);
    const hits = await provider.searchTopNCandidates('冰岛', 3);
    expect(hits).toEqual([]);
  });
});
