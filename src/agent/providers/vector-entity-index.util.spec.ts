import { cosineSimilarity, rankVectorIndex } from './vector-entity-index.util';

describe('vector-entity-index.util', () => {
  it('cosineSimilarity 同向向量得 1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('rankVectorIndex 按阈值过滤并排序', () => {
    const hits = rankVectorIndex(
      [
        { label: '冰岛', kind: 'destination', embedding: [1, 0, 0] },
        { label: '东京', kind: 'destination', embedding: [0, 1, 0] },
        { label: '雷克雅未克', kind: 'destination', embedding: [0.9, 0.1, 0] },
      ],
      [1, 0, 0],
      2,
      0.7,
    );
    expect(hits.map((h) => h.label)).toEqual(['冰岛', '雷克雅未克']);
    expect(hits[0].score).toBeGreaterThan(hits[1].score ?? 0);
  });
});
