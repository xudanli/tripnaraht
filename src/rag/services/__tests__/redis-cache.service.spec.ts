// src/rag/services/__tests__/redis-cache.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RedisCacheService } from '../redis-cache.service';
import { createClient } from 'redis';

// Mock redis client
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

describe('RedisCacheService', () => {
  let service: RedisCacheService;
  let mockRedisClient: any;

  beforeEach(async () => {
    // 创建 mock Redis 客户端
    mockRedisClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      incrBy: jest.fn(),
      expire: jest.fn(),
      flushAll: jest.fn(),
      ping: jest.fn(),
      info: jest.fn(),
      on: jest.fn((event, handler) => {
        // Simulate successful connection
        if (event === 'connect') {
          setTimeout(() => handler(), 0);
        }
        return mockRedisClient;
      }),
    };

    // Mock createClient 返回 mock 客户端
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisCacheService],
    }).compile();

    service = module.get<RedisCacheService>(RedisCacheService);

    // 等待初始化完成并手动设置连接状态
    await new Promise((resolve) => setTimeout(resolve, 50));
    (service as any).isConnected = true;
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('应该成功获取缓存值', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('缓存未命中时应返回 null', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('Redis 不可用时应返回 null', async () => {
      // 模拟未连接状态
      (service as any).isConnected = false;

      const result = await service.get('test-key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('解析 JSON 失败时应返回 null', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json{');

      const result = await service.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('应该成功设置缓存值', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.setEx.mockResolvedValue('OK');

      const result = await service.set('test-key', testData, 3600);

      expect(result).toBe(true);
      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test-key',
        3600,
        JSON.stringify(testData)
      );
    });

    it('应该使用默认 TTL', async () => {
      mockRedisClient.setEx.mockResolvedValue('OK');

      await service.set('test-key', 'test-value');

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'test-key',
        3600, // 默认 1 小时
        JSON.stringify('test-value')
      );
    });

    it('Redis 不可用时应返回 false', async () => {
      (service as any).isConnected = false;

      const result = await service.set('test-key', 'test-value');

      expect(result).toBe(false);
      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('设置失败时应返回 false', async () => {
      mockRedisClient.setEx.mockRejectedValue(new Error('Redis error'));

      const result = await service.set('test-key', 'test-value');

      expect(result).toBe(false);
    });
  });

  describe('del', () => {
    it('应该成功删除缓存', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('Redis 不可用时应返回 false', async () => {
      (service as any).isConnected = false;

      const result = await service.del('test-key');

      expect(result).toBe(false);
    });
  });

  describe('delPattern', () => {
    it('应该成功批量删除缓存', async () => {
      const keys = ['test:1', 'test:2', 'test:3'];
      mockRedisClient.keys.mockResolvedValue(keys);
      mockRedisClient.del.mockResolvedValue(keys.length);

      const result = await service.delPattern('test:*');

      expect(result).toBe(3);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith(keys);
    });

    it('无匹配键时应返回 0', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      const result = await service.delPattern('non-existent:*');

      expect(result).toBe(0);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('键存在时应返回 true', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
    });

    it('键不存在时应返回 false', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists('non-existent-key');

      expect(result).toBe(false);
    });
  });

  describe('ttl', () => {
    it('应该返回剩余 TTL', async () => {
      mockRedisClient.ttl.mockResolvedValue(3600);

      const result = await service.ttl('test-key');

      expect(result).toBe(3600);
    });

    it('键不存在时应返回 -2', async () => {
      mockRedisClient.ttl.mockResolvedValue(-2);

      const result = await service.ttl('non-existent-key');

      expect(result).toBe(-2);
    });
  });

  describe('incr', () => {
    it('应该成功增加计数器', async () => {
      mockRedisClient.incrBy.mockResolvedValue(5);

      const result = await service.incr('counter', 5);

      expect(result).toBe(5);
      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('counter', 5);
    });

    it('应该使用默认增量 1', async () => {
      mockRedisClient.incrBy.mockResolvedValue(1);

      await service.incr('counter');

      expect(mockRedisClient.incrBy).toHaveBeenCalledWith('counter', 1);
    });
  });

  describe('expire', () => {
    it('应该成功设置过期时间', async () => {
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.expire('test-key', 3600);

      expect(result).toBe(true);
      expect(mockRedisClient.expire).toHaveBeenCalledWith('test-key', 3600);
    });
  });

  describe('flushAll', () => {
    it('应该成功清空所有缓存', async () => {
      mockRedisClient.flushAll.mockResolvedValue('OK');

      const result = await service.flushAll();

      expect(result).toBe(true);
      expect(mockRedisClient.flushAll).toHaveBeenCalled();
    });
  });

  describe('isReady', () => {
    it('连接成功时应返回 true', () => {
      (service as any).isConnected = true;
      (service as any).client = mockRedisClient;

      const result = service.isReady();

      expect(result).toBe(true);
    });

    it('未连接时应返回 false', () => {
      (service as any).isConnected = false;

      const result = service.isReady();

      expect(result).toBe(false);
    });

    it('客户端为 null 时应返回 false', () => {
      (service as any).isConnected = true;
      (service as any).client = null;

      const result = service.isReady();

      expect(result).toBe(false);
    });
  });

  describe('ping', () => {
    it('应该成功 ping Redis', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const result = await service.ping();

      expect(result).toBe(true);
    });

    it('ping 失败时应返回 false', async () => {
      mockRedisClient.ping.mockResolvedValue('ERROR');

      const result = await service.ping();

      expect(result).toBe(false);
    });

    it('Redis 不可用时应返回 false', async () => {
      (service as any).isConnected = false;

      const result = await service.ping();

      expect(result).toBe(false);
    });
  });

  describe('info', () => {
    it('应该返回 Redis 信息', async () => {
      const mockInfo = 'redis_version:6.2.0\nuptime_in_seconds:12345';
      mockRedisClient.info.mockResolvedValue(mockInfo);

      const result = await service.info();

      expect(result).toBe(mockInfo);
    });

    it('Redis 不可用时应返回 null', async () => {
      (service as any).isConnected = false;

      const result = await service.info();

      expect(result).toBeNull();
    });
  });

  describe('onModuleDestroy', () => {
    it('应该正确关闭连接', async () => {
      (service as any).client = mockRedisClient;

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('reconnection strategy', () => {
    it('应该配置正确的重连策略', () => {
      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          socket: expect.objectContaining({
            reconnectStrategy: expect.any(Function),
          }),
        })
      );
    });

    it('重连次数超过 10 次应停止', () => {
      const callArgs = (createClient as jest.Mock).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      const result = reconnectStrategy(11);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toContain('reconnection failed');
    });

    it('应该使用指数退避', () => {
      const callArgs = (createClient as jest.Mock).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      expect(reconnectStrategy(0)).toBe(1000); // 2^0 * 1000
      expect(reconnectStrategy(1)).toBe(2000); // 2^1 * 1000
      expect(reconnectStrategy(2)).toBe(4000); // 2^2 * 1000
      expect(reconnectStrategy(3)).toBe(8000); // 2^3 * 1000
    });

    it('延迟应不超过 30 秒', () => {
      const callArgs = (createClient as jest.Mock).mock.calls[0][0];
      const reconnectStrategy = callArgs.socket.reconnectStrategy;

      expect(reconnectStrategy(10)).toBe(30000); // 最大 30s
    });
  });
});
