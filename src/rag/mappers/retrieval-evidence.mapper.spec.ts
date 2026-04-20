import type { ChunkRetrievalResult } from '../services/chunk-retrieval.service';
import { RetrievalEvidenceMapper } from './retrieval-evidence.mapper';

function makeChunk(
  partial: Pick<
    ChunkRetrievalResult,
    'id' | 'category' | 'chunkUpdatedAt' | 'similarity' | 'hybridScore' | 'metadata'
  >,
): ChunkRetrievalResult {
  return {
    id: partial.id,
    chunkId: partial.id,
    content: '',
    type: 'general',
    credibilityScore: 0.9,
    keywords: [],
    metadata: partial.metadata ?? {},
    fileId: '00000000-0000-4000-8000-000000000001',
    similarity: partial.similarity ?? 0.5,
    hybridScore: partial.hybridScore,
    category: partial.category,
    chunkUpdatedAt: partial.chunkUpdatedAt,
  };
}

describe('RetrievalEvidenceMapper.toEvidence', () => {
  const now = new Date('2026-04-17T14:00:00.000Z');

  it('merges same category by freshest (minimum ageHours)', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [
        makeChunk({
          id: '1',
          category: 'ROAD_STATUS',
          similarity: 0.9,
          chunkUpdatedAt: new Date('2026-04-17T04:00:00.000Z'),
        }),
        makeChunk({
          id: '2',
          category: 'ROAD_STATUS',
          similarity: 0.85,
          chunkUpdatedAt: new Date('2026-04-17T12:00:00.000Z'),
        }),
      ],
      { now, scoreThreshold: 0.6 },
    );
    expect(ev).toHaveLength(1);
    expect(ev[0].category).toBe('ROAD_STATUS');
    expect(ev[0].ageHours).toBeCloseTo(2, 5);
  });

  it('drops chunks below scoreThreshold when set', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [
        makeChunk({
          id: '1',
          category: 'RULES',
          similarity: 0.5,
          chunkUpdatedAt: now,
        }),
      ],
      { now, scoreThreshold: 0.6 },
    );
    expect(ev).toHaveLength(0);
  });

  it('does not filter by score when scoreThreshold omitted', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [makeChunk({ id: '1', category: 'RULES', similarity: 0.01, chunkUpdatedAt: now })],
      { now },
    );
    expect(ev).toHaveLength(1);
  });

  it('orders RULES before ROAD_STATUS in output', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [
        makeChunk({
          id: '1',
          category: 'ROAD_STATUS',
          similarity: 0.9,
          chunkUpdatedAt: new Date('2026-04-17T12:00:00.000Z'),
        }),
        makeChunk({
          id: '2',
          category: 'RULES',
          similarity: 0.9,
          chunkUpdatedAt: new Date('2026-04-10T12:00:00.000Z'),
        }),
      ],
      { now, scoreThreshold: 0.2 },
    );
    expect(ev.map((e) => e.category)).toEqual(['RULES', 'ROAD_STATUS']);
  });

  it('emits category without ageHours when no chunkUpdatedAt', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [makeChunk({ id: '1', category: 'RULES', similarity: 0.9 })],
      { now, scoreThreshold: 0.2 },
    );
    expect(ev[0].ageHours).toBeUndefined();
  });

  it('derives RULES/ROAD_STATUS from metadata.structured_data.f_road_required', () => {
    const ev = RetrievalEvidenceMapper.toEvidence(
      [
        makeChunk({
          id: '1',
          category: 'POI_HOURS',
          similarity: 0.9,
          chunkUpdatedAt: new Date('2026-04-17T12:00:00.000Z'),
          metadata: {
            structured_data: {
              f_road_required: { required: true, roads: ['F206'] },
            },
          },
        }),
      ],
      { now, scoreThreshold: 0.2 },
    );
    const cats = ev.map((e) => e.category);
    expect(cats).toEqual(expect.arrayContaining(['POI_HOURS', 'RULES', 'ROAD_STATUS']));
  });
});
