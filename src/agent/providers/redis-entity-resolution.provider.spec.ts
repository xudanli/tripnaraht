import { RedisEntityResolutionProvider } from './redis-entity-resolution.provider';
import type { RedisService } from '../../redis/redis.service';

describe('RedisEntityResolutionProvider', () => {
  const redisStore = new Map<string, unknown>();

  const mockRedis: Pick<RedisService, 'get' | 'set'> = {
    get: jest.fn(async <T>(key: string) => redisStore.get(key) as T | undefined),
    set: jest.fn(async (key: string, value: unknown) => {
      redisStore.set(key, value);
    }),
  };

  let provider: RedisEntityResolutionProvider;

  beforeEach(async () => {
    redisStore.clear();
    provider = new RedisEntityResolutionProvider(mockRedis as RedisService);
    await provider.seedFromStaticGraph();
  });

  it('resolveExactEntity 命中大苹果 → 纽约', async () => {
    const entity = await provider.resolveExactEntity('大苹果', 'hotel');
    expect(entity?.name).toBe('纽约');
    expect(entity?.type).toBe('destination');
  });

  it('tryExactResolution 高置信别名跳过 Stage 1 LLM', async () => {
    const res = await provider.tryExactResolution('大苹果 海景酒店', 'hotel');
    expect(res?.entity.name).toBe('纽约');
    expect(res?.skipStage1Llm).toBe(true);
    expect(res!.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it('getTopNCandidates 按 query 子串粗筛', async () => {
    const candidates = await provider.getTopNCandidates('冰岛南岸温泉', 'poi', 5);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some((c) => /冰岛|雷克雅未克/i.test(c))).toBe(true);
  });

  it('Redis 穿透：L1 未命中时从 Redis 读取', async () => {
    const fresh = new RedisEntityResolutionProvider(mockRedis as RedisService);
    redisStore.set('tripnara:er:alias:general:testalias', {
      id: 'TestCity',
      name: 'TestCity',
      type: 'destination',
    });
    const entity = await fresh.resolveExactEntity('testalias', 'general');
    expect(entity?.name).toBe('TestCity');
    expect(mockRedis.get).toHaveBeenCalled();
  });

  it('resolveAlias 实现 EntityResolutionCacheProvider', async () => {
    const hit = await provider.resolveAlias('LA');
    expect(hit?.standard).toBe('洛杉矶');
    expect(hit?.source).toBe('redis');
  });
});
