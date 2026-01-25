// src/rag/services/__tests__/retry-helper.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { RetryHelperService } from '../retry-helper.service';

describe('RetryHelperService', () => {
  let service: RetryHelperService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetryHelperService],
    }).compile();

    service = module.get<RetryHelperService>(RetryHelperService);
  });

  describe('executeWithRetry', () => {
    it('操作成功时应立即返回结果', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await service.executeWithRetry(operation);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attemptCount).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('操作失败应重试并最终成功', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve('success after retries');
      });

      const result = await service.executeWithRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 10, // 缩短测试时间
        logging: false,
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success after retries');
      expect(result.attemptCount).toBe(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('达到最大重试次数后应返回失败', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));

      const result = await service.executeWithRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
        logging: false,
      });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(2); // maxRetries=2 means attempt 1, 2 (total 2)
      expect(result.lastError?.message).toBe('Persistent error');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('不可重试错误应立即失败', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ValidationError: Invalid input'));

      const result = await service.executeWithRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 10,
        logging: false,
      });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('应该使用指数退避', async () => {
      const delays: number[] = [];
      let callCount = 0;
      let lastCallTime = 0;

      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        const now = Date.now();
        if (lastCallTime > 0) {
          delays.push(now - lastCallTime);
        }
        lastCallTime = now;

        if (callCount < 3) {
          return Promise.reject(new Error('Retry me'));
        }
        return Promise.resolve('success');
      });

      await service.executeWithRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffFactor: 2,
        logging: false,
      });

      // 验证延迟呈指数增长 (100ms, 200ms)
      expect(delays.length).toBe(2);
      expect(delays[1]).toBeGreaterThan(delays[0]);
    });

    it('延迟不应超过 maxDelayMs', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          return Promise.reject(new Error('Retry me'));
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      await service.executeWithRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 10000,
        maxDelayMs: 50, // 最大 50ms
        backoffFactor: 2,
        logging: false,
      });
      const totalTime = Date.now() - startTime;

      // 总时间应该远小于 10000 + 20000 + 40000 (如果没有 maxDelayMs 限制)
      expect(totalTime).toBeLessThan(500);
    });

    it('应该记录重试日志', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      const warnSpy = jest.spyOn(service['logger'], 'warn');

      let callCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error('Retry me'));
        }
        return Promise.resolve('success');
      });

      await service.executeWithRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
        logging: true,
      });

      expect(logSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('retryApiCall', () => {
    it('应该使用 API 专用配置', async () => {
      const operation = jest.fn().mockRejectedValueOnce(new Error('500 Internal Server Error'))
        .mockResolvedValueOnce('success');

      const result = await service.retryApiCall(operation, 'test-api');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attemptCount).toBe(2);
    });

    it('应该重试网络错误', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const result = await service.retryApiCall(operation, 'test-api');

      expect(result.success).toBe(true);
    });

    it('应该重试 5xx 错误', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('502 Bad Gateway'))
        .mockResolvedValueOnce('success');

      const result = await service.retryApiCall(operation, 'test-api');

      expect(result.success).toBe(true);
    });

    it('不应该重试 4xx 错误', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('401 Unauthorized'));

      const result = await service.retryApiCall(operation, 'test-api');

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1); // 不重试
    });
  });

  describe('retryDbQuery', () => {
    it('应该使用数据库专用配置', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('LockTimeout'))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.retryDbQuery(operation, 'test-query');

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ rows: [] });
      expect(result.attemptCount).toBe(2);
    });

    it('应该重试连接错误', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.retryDbQuery(operation, 'test-query');

      expect(result.success).toBe(true);
    });

    it('应该重试死锁', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('DeadlockDetected'))
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.retryDbQuery(operation, 'test-query');

      expect(result.success).toBe(true);
    });
  });

  describe('createRetrier', () => {
    it('应该创建预配置的重试器', async () => {
      const retrier = service.createRetrier({
        maxRetries: 2,
        initialDelayMs: 10,
        logging: false,
      });

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Retry me'))
        .mockResolvedValueOnce('success');

      const result = await retrier(operation);

      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(2);
    });
  });

  describe('错误类型过滤', () => {
    it('retryableErrors 应该只重试指定错误', async () => {
      const operation1 = jest.fn().mockRejectedValue(new Error('NetworkError'));
      const operation2 = jest.fn().mockRejectedValue(new Error('OtherError'));

      const result1 = await service.executeWithRetry(operation1, {
        maxRetries: 2,
        initialDelayMs: 10,
        retryableErrors: ['NetworkError'],
        logging: false,
      });

      const result2 = await service.executeWithRetry(operation2, {
        maxRetries: 2,
        initialDelayMs: 10,
        retryableErrors: ['NetworkError'],
        logging: false,
      });

      expect(result1.attemptCount).toBe(2); // 重试 (maxRetries=2)
      expect(result2.attemptCount).toBe(1); // 不重试
    });

    it('nonRetryableErrors 应该优先于 retryableErrors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ValidationError'));

      const result = await service.executeWithRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
        retryableErrors: ['ValidationError'], // 允许重试
        nonRetryableErrors: ['ValidationError'], // 但在黑名单中
        logging: false,
      });

      expect(result.attemptCount).toBe(1); // 不重试
    });
  });

  describe('边界情况', () => {
    it('maxRetries=0 应该只执行一次', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Error'));

      const result = await service.executeWithRetry(operation, {
        maxRetries: 0,
        logging: false,
      });

      expect(result.attemptCount).toBe(1);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('initialDelayMs=0 应该立即重试', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Retry me'));
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      await service.executeWithRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 0,
        logging: false,
      });
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(50); // 应该很快完成
    });

    it('backoffFactor=1 应该使用固定延迟', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          return Promise.reject(new Error('Retry me'));
        }
        return Promise.resolve('success');
      });

      await service.executeWithRetry(operation, {
        maxRetries: 3,
        initialDelayMs: 100,
        backoffFactor: 1,
        logging: false,
      });

      // 所有延迟应该相同（100ms）
      expect(operation).toHaveBeenCalledTimes(3); // maxRetries=3 means attempts 1,2,3
    });
  });

  describe('性能测试', () => {
    it('大量重试应该在合理时间内完成', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Error'));

      const startTime = Date.now();
      await service.executeWithRetry(operation, {
        maxRetries: 5,
        initialDelayMs: 10,
        maxDelayMs: 50,
        logging: false,
      });
      const totalTime = Date.now() - startTime;

      // 5 次重试应该在 500ms 内完成
      expect(totalTime).toBeLessThan(500);
    });
  });
});
