import { NoopIndexingExtractionMiddleware } from './indexing-extraction.middleware';

describe('NoopIndexingExtractionMiddleware', () => {
  it('resolves without side effects', async () => {
    const m = new NoopIndexingExtractionMiddleware();
    await expect(
      m.run({
        file: {
          filename: 'x.json',
          filepath: '/x',
          content: {},
          metadata: {
            version: '1',
            credibility_score: 0.8,
            language: 'zh-CN',
            data_sources: [],
            last_updated: new Date().toISOString(),
          },
        },
        fileId: '00000000-0000-4000-8000-000000000001',
        fileCategory: 'general',
        chunk: {
          chunkId: 'c1',
          content: 'hello',
          type: 'general',
          credibilityScore: 0.8,
          keywords: [],
        },
        chunkIndex: 0,
        totalChunks: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
