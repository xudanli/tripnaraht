import {
  LRUCache,
  DecisionCacheService,
  DecisionCacheKeys,
} from './decision-cache.service';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3);
  });

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1', 60000);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('non-existent')).toBeUndefined();
    });

    it('should return undefined for expired keys', async () => {
      cache.set('expiring', 'value', 10);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(cache.get('expiring')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used when full', () => {
      cache.set('a', 'val-a', 60000);
      cache.set('b', 'val-b', 60000);
      cache.set('c', 'val-c', 60000);
      cache.set('d', 'val-d', 60000);

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('val-b');
      expect(cache.get('c')).toBe('val-c');
      expect(cache.get('d')).toBe('val-d');
    });

    it('should update LRU order on access', () => {
      cache.set('a', 'val-a', 60000);
      cache.set('b', 'val-b', 60000);
      cache.set('c', 'val-c', 60000);

      cache.get('a');

      cache.set('d', 'val-d', 60000);

      expect(cache.get('a')).toBe('val-a');
      expect(cache.get('b')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key', 'value', 60000);
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('non-existent')).toBe(false);
    });

    it('should return false for expired keys', async () => {
      cache.set('expiring', 'value', 10);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(cache.has('expiring')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove keys', () => {
      cache.set('key', 'value', 60000);
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should return false for non-existent keys', () => {
      expect(cache.delete('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all keys', () => {
      cache.set('a', 'value', 60000);
      cache.set('b', 'value', 60000);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      cache.set('a', 'value', 60000);
      expect(cache.size()).toBe(1);
      cache.set('b', 'value', 60000);
      expect(cache.size()).toBe(2);
    });
  });

  describe('keys', () => {
    it('should return all keys', () => {
      cache.set('a', 'value', 60000);
      cache.set('b', 'value', 60000);
      const keys = cache.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });
  });

  describe('prune', () => {
    it('should remove expired entries', async () => {
      cache.set('short', 'value', 10);
      cache.set('long', 'value', 60000);

      await new Promise(resolve => setTimeout(resolve, 20));

      const pruned = cache.prune();
      expect(pruned).toBe(1);
      expect(cache.size()).toBe(1);
      expect(cache.get('long')).toBe('value');
    });
  });
});

describe('DecisionCacheService', () => {
  let service: DecisionCacheService;

  beforeEach(() => {
    service = new DecisionCacheService();
  });

  describe('get and set', () => {
    it('should store and retrieve values', async () => {
      await service.set('key', 'value');
      const result = await service.get<string>('key');
      expect(result).toBe('value');
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await service.get('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove keys', async () => {
      await service.set('key', 'value');
      await service.delete('key');
      const result = await service.get('key');
      expect(result).toBeUndefined();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      await service.set('key', 'cached');
      let factoryCalled = false;

      const result = await service.getOrSet('key', async () => {
        factoryCalled = true;
        return 'fresh';
      });

      expect(result).toBe('cached');
      expect(factoryCalled).toBe(false);
    });

    it('should call factory and cache if not exists', async () => {
      let factoryCallCount = 0;

      const result = await service.getOrSet('new-key', async () => {
        factoryCallCount++;
        return 'fresh-value';
      });

      expect(result).toBe('fresh-value');
      expect(factoryCallCount).toBe(1);

      const cachedResult = await service.get('new-key');
      expect(cachedResult).toBe('fresh-value');
    });

    it('should prevent thundering herd (cache stampede)', async () => {
      let factoryCallCount = 0;

      const factory = async () => {
        factoryCallCount++;
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'value';
      };

      const [result1, result2, result3] = await Promise.all([
        service.getOrSet('concurrent', factory),
        service.getOrSet('concurrent', factory),
        service.getOrSet('concurrent', factory),
      ]);

      expect(factoryCallCount).toBe(1);
      expect(result1).toBe('value');
      expect(result2).toBe('value');
      expect(result3).toBe('value');
    });
  });

  describe('invalidatePattern', () => {
    it('should invalidate matching keys', async () => {
      await service.set('user:1:profile', 'data1');
      await service.set('user:2:profile', 'data2');
      await service.set('other:data', 'data3');

      const count = await service.invalidatePattern('user:*');

      expect(count).toBe(2);
      expect(await service.get('user:1:profile')).toBeUndefined();
      expect(await service.get('user:2:profile')).toBeUndefined();
      expect(await service.get('other:data')).toBe('data3');
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', async () => {
      await service.set('key', 'value');
      await service.get('key');
      await service.get('key');
      await service.get('non-existent');

      const stats = service.getStats();

      expect(stats.l1.hits).toBe(2);
      expect(stats.l1.misses).toBe(1);
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('resetStats', () => {
    it('should reset statistics', async () => {
      await service.set('key', 'value');
      await service.get('key');

      service.resetStats();

      const stats = service.getStats();
      expect(stats.l1.hits).toBe(0);
      expect(stats.l1.misses).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear L1 cache', async () => {
      await service.set('key1', 'value1');
      await service.set('key2', 'value2');

      service.clear();

      expect(await service.get('key1')).toBeUndefined();
      expect(await service.get('key2')).toBeUndefined();
    });
  });

  describe('prune', () => {
    it('should prune expired entries', async () => {
      await service.set('short', 'value', { ttlMs: 10, randomizeTtl: false });
      await service.set('long', 'value', { ttlMs: 60000, randomizeTtl: false });

      await new Promise(resolve => setTimeout(resolve, 20));

      const pruned = service.prune();
      expect(pruned).toBe(1);
    });
  });
});

describe('DecisionCacheKeys', () => {
  it('should build DSO key', () => {
    expect(DecisionCacheKeys.dso('req-001')).toBe('decision:dso:req-001');
  });

  it('should build DSO version key', () => {
    expect(DecisionCacheKeys.dsoVersion('req-001', 2)).toBe('decision:dso:req-001:v2');
  });

  it('should build user weights key', () => {
    expect(DecisionCacheKeys.userWeights('user-001')).toBe('decision:weights:user-001');
  });

  it('should build policy output key', () => {
    expect(DecisionCacheKeys.policyOutput('req-001')).toBe('decision:policy:req-001');
  });

  it('should build utility result key', () => {
    expect(DecisionCacheKeys.utilityResult('req-001')).toBe('decision:utility:req-001');
  });

  it('should build snapshot key', () => {
    expect(DecisionCacheKeys.snapshot('req-001', 3)).toBe('decision:snapshot:req-001:3');
  });

  it('should build snapshot list key', () => {
    expect(DecisionCacheKeys.snapshotList('req-001')).toBe('decision:snapshots:req-001');
  });

  it('should build stability analysis key', () => {
    expect(DecisionCacheKeys.stabilityAnalysis('req-001')).toBe('decision:stability:req-001');
  });

  it('should build pattern', () => {
    expect(DecisionCacheKeys.pattern('dso')).toBe('decision:dso:*');
  });
});
