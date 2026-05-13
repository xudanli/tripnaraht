import { PrismaMemoryCognitiveSliceProvider } from './prisma-memory-cognitive-slice.provider';

describe('PrismaMemoryCognitiveSliceProvider', () => {
  it('将 SQL 行投影为 DecisionLogCognitiveSlice（仅白名单 metadata）', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          step: 'NARRATE',
          timestamp: new Date('2026-02-01T12:00:00.000Z'),
          metadata: {
            ebp_stance: 'COMPLIANCE_FIRST',
            conflict_count: 2,
            decision_source: 'MEMORY_REPLAY',
            effective_voice_tone: 'warm',
            extra_pii_field: 'must-not-leak',
          },
        },
      ]),
    };
    const provider = new PrismaMemoryCognitiveSliceProvider(prisma as any);
    const out = await provider.loadRecentNarrateSlices('req-abc', 50);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0].step).toBe('NARRATE');
    expect(out[0].timestamp).toBe('2026-02-01T12:00:00.000Z');
    expect(out[0].metadata).toEqual({
      ebp_stance: 'COMPLIANCE_FIRST',
      conflict_count: 2,
      decision_source: 'MEMORY_REPLAY',
      effective_voice_tone: 'warm',
    });
    expect((out[0].metadata as any).extra_pii_field).toBeUndefined();
  });

  it('查询失败时返回空数组', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const provider = new PrismaMemoryCognitiveSliceProvider(prisma as any);
    await expect(provider.loadRecentNarrateSlices('r1')).resolves.toEqual([]);
  });

  it('空 subject 不查库', async () => {
    const prisma = { $queryRaw: jest.fn() };
    const provider = new PrismaMemoryCognitiveSliceProvider(prisma as any);
    await expect(provider.loadRecentNarrateSlices('  ')).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
