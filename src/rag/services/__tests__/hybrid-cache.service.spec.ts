// src/rag/services/__tests__/hybrid-cache.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { HybridCacheService } from '../hybrid-cache.service';
import { RedisCacheService } from '../redis-cache.service';

describe('HybridCacheService', () => {
  let service: HybridCacheService;
  let mockRedisCache: jest.Mocked<RedisCacheService>;

  beforeEach(async () => {
    // 创建 mock RedisCacheService
    mockRedisCache = {
      isReady: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delPattern: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      flushAll: jest.fn(),
      ping: jest.fn(),
      info: jest.fn(),
      onModuleDestroy: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HybridCacheService,
        {
          provide: RedisCacheService,
          useValue: mockRedisCache,
        },
      ],
    }).compile();

    service = module.get<HybridCacheService>(HybridCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    const testData = { name: 'test', value: 123 };

    it('Redis 可用时应优先从 Redis 获取', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.get.mockResolvedValue(testData);

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisCache.get).toHaveBeenCalledWith('test-key');
    });

    it('Redis 未命中时应降级到内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.get.mockResolvedValue(null);

      // 先写入内存缓存
      await service.set('test-key', testData, 3600);
      mockRedisCache.get.mockResolvedValue(null); // 确保 Redis 返回 null

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
    });

    it('Redis 不可用时应直接使用内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(false);

      // 先写入内存缓存
      await service.set('test-key', testData, 3600);

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisCache.get).not.toHaveBeenCalled();
    });

    it('Redis 抛出错误时应降级到内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.get.mockRejectedValue(new Error('Redis error'));

      // 先写入内存缓存
      await service.set('test-key', testData, 3600);

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
    });

    it('内存缓存过期时应返回 null', async () => {
      mockRedisCache.isReady.mockReturnValue(false);

      // 写入内存缓存（TTL 0 秒，立即过期）
      await service.set('test-key', testData, 0);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await service.get<typeof testData>('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    const testData = { name: 'test', value: 123 };

    it('Redis 可用时应同时写入 Redis 和内存（双写策略）', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.set.mockResolvedValue(true);

      const result = await service.set('test-key', testData, 3600);

      expect(result).toBe(true);
      expect(mockRedisCache.set).toHaveBeenCalledWith('test-key', testData, 3600);

      // 验证内存缓存也已写入
      mockRedisCache.isReady.mockReturnValue(false);
      const cachedValue = await service.get<typeof testData>('test-key');
      expect(cachedValue).toEqual(testData);
    });

    it('Redis 失败时仍应写入内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.set.mockRejectedValue(new Error('Redis error'));

      const result = await service.set('test-key', testData, 3600);

      expect(result).toBe(true); // 内存缓存成功

      // 验证内存缓存已写入
      mockRedisCache.isReady.mockReturnValue(false);
      const cachedValue = await service.get<typeof testData>('test-key');
      expect(cachedValue).toEqual(testData);
    });

    it('Redis 不可用时应仅写入内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(false);

      const result = await service.set('test-key', testData, 3600);

      expect(result).toBe(true);
      expect(mockRedisCache.set).not.toHaveBeenCalled();
    });

    it('应该使用默认 TTL (3600 秒)', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.set.mockResolvedValue(true);

      await service.set('test-key', testData);

      expect(mockRedisCache.set).toHaveBeenCalledWith('test-key', testData, 3600);
    });
  });

  describe('del', () => {
    it('应该同时从 Redis 和内存删除', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.del.mockResolvedValue(true);

      // 先写入
      await service.set('test-key', 'test-value', 3600);

      const result = await service.del('test-key');

      expect(result).toBe(true);
      expect(mockRedisCache.del).toHaveBeenCalledWith('test-key');

      // 验证内存缓存也已删除
      mockRedisCache.isReady.mockReturnValue(false);
      const cachedValue = await service.get('test-key');
      expect(cachedValue).toBeNull();
    });

    it('Redis 不可用时应仅从内存删除', async () => {
      mockRedisCache.isReady.mockReturnValue(false);

      // 先写入内存缓存
      await service.set('test-key', 'test-value', 3600);

      const result = await service.del('test-key');

      expect(result).toBe(true);
      expect(mockRedisCache.del).not.toHaveBeenCalled();
    });
  });

  describe('delPattern', () => {
    it('应该批量删除匹配的键', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.delPattern.mockResolvedValue(3);

      // 写入测试数据到内存
      await service.set('test:1', 'value1', 3600);
      await service.set('test:2', 'value2', 3600);
      await service.set('other:1', 'value3', 3600);

      const result = await service.delPattern('test:*');

      expect(result).toBeGreaterThanOrEqual(2); // 至少删除 2 个内存缓存
      expect(mockRedisCache.delPattern).toHaveBeenCalledWith('test:*');
    });

    it('无匹配键时应返回 0', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.delPattern.mockResolvedValue(0);

      const result = await service.delPattern('non-existent:*');

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('Redis 中存在时应返回 true', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.exists.mockResolvedValue(true);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
    });

    it('Redis 中不存在但内存中存在时应返回 true', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.exists.mockResolvedValue(false);

      // 写入内存缓存
      await service.set('test-key', 'test-value', 3600);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
    });

    it('都不存在时应返回 false', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.exists.mockResolvedValue(false);

      const result = await service.exists('non-existent-key');

      expect(result).toBe(false);
    });
  });

  describe('flushAll', () => {
    it('应该清空 Redis 和内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(true);
      mockRedisCache.flushAll.mockResolvedValue(true);

      // 写入测试数据
      await service.set('test-key', 'test-value', 3600);

      const result = await service.flushAll();

      expect(result).toBe(true);
      expect(mockRedisCache.flushAll).toHaveBeenCalled();

      // 验证内存缓存已清空
      const stats = service.getStats();
      expect(stats.memorySize).toBe(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      mockRedisCache.isReady.mockReturnValue(true);

      // 写入测试数据
      await service.set('test-key-1', 'value1', 3600);
      await service.set('test-key-2', 'value2', 3600);

      const stats = service.getStats();

      expect(stats.memorySize).toBe(2);
      expect(stats.redisConnected).toBe(true);
    });

    it('Redis 不可用时应反映正确状态', () => {
      mockRedisCache.isReady.mockReturnValue(false);

      const stats = service.getStats();

      expect(stats.redisConnected).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('应该清理过期的内存缓存', async () => {
      mockRedisCache.isReady.mockReturnValue(false);

      // 写入即将过期的数据
      await service.set('expired-key', 'value', 0);
      await service.set('valid-key', 'value', 3600);

      // 等待过期
      await new Promise((resolve) => setTimeout(resolve, 10));

      const count = service.cleanupExpired();

      expect(count).toBe(1);

      const stats = service.getStats();
      expect(stats.memorySize).toBe(1);
    });

    it('无过期缓存时应返回 0', () => {
      const count = service.cleanupExpired();

      expect(count).toBe(0);
    });
  });

  describe('无 Redis 服务（纯内存模式）', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [HybridCacheService],
      }).compile();

      service = module.get<HybridCacheService>(HybridCacheService);
    });

    it('应该仍能正常工作', async () => {
      const testData = { name: 'test', value: 123 };

      // 设置
      const setResult = await service.set('test-key', testData, 3600);
      expect(setResult).toBe(true);

      // 获取
      const getResult = await service.get<typeof testData>('test-key');
      expect(getResult).toEqual(testData);

      // 删除
      const delResult = await service.del('test-key');
      expect(delResult).toBe(true);

      // 验证已删除
      const getAfterDel = await service.get('test-key');
      expect(getAfterDel).toBeNull();
    });

    it('统计信息应反映无 Redis 连接', () => {
      const stats = service.getStats();

      expect(stats.redisConnected).toBe(false);
    });
  });
});
