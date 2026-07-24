import {
  ER_QDRANT_COLLECTION,
  QdrantErClient,
  resolveQdrantBaseUrl,
} from './qdrant-er-client.util';

describe('qdrant-er-client.util', () => {
  it('ER_QDRANT_COLLECTION 应与 VectorEntityResolutionProvider 一致', () => {
    expect(ER_QDRANT_COLLECTION).toBe('tripnara_er_entities');
  });

  it('healthCheck 在不可达 URL 时返回 false', async () => {
    const client = new QdrantErClient('http://127.0.0.1:1');
    await expect(client.healthCheck()).resolves.toBe(false);
  });

  it('resolveQdrantBaseUrl 在无效配置时应返回 undefined', async () => {
    await expect(resolveQdrantBaseUrl('http://127.0.0.1:1')).resolves.toBeUndefined();
  });
});
