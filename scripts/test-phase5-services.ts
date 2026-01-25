#!/usr/bin/env tsx
/**
 * Phase 5.2 服务集成测试
 *
 * 测试 Phase 5.2 创建的核心服务：
 * - RedisCacheService
 * - HybridCacheService
 * - RetryHelperService
 * - ParallelExecutorService
 *
 * 这些服务是独立的，无需完整应用上下文
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisCacheService } from '../src/rag/services/redis-cache.service';
import { HybridCacheService } from '../src/rag/services/hybrid-cache.service';
import { RetryHelperService } from '../src/rag/services/retry-helper.service';
import { ParallelExecutorService } from '../src/rag/services/parallel-executor.service';

const logger = new Logger('Phase5ServicesTest');

interface TestCase {
  id: string;
  name: string;
  service: string;
  test: () => Promise<boolean>;
}

async function main() {
  logger.log('========================================');
  logger.log('Phase 5.2 服务集成测试');
  logger.log('========================================\n');

  try {
    // 创建测试模块
    logger.log('初始化服务...');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
      ],
      providers: [
        RedisCacheService,
        HybridCacheService,
        RetryHelperService,
        ParallelExecutorService,
      ],
    }).compile();

    const redisCache = moduleRef.get(RedisCacheService);
    const hybridCache = moduleRef.get(HybridCacheService);
    const retryHelper = moduleRef.get(RetryHelperService);
    const parallelExecutor = moduleRef.get(ParallelExecutorService);

    logger.log('✓ 服务初始化完成\n');

    // 等待Redis连接（如果可用）
    await new Promise(resolve => setTimeout(resolve, 100));

    // 定义测试用例
    const testCases: TestCase[] = [
      // HybridCache 测试
      {
        id: 'cache-001',
        name: 'HybridCache - 基本读写',
        service: 'HybridCacheService',
        test: async () => {
          const key = 'test-key-001';
          const value = { message: 'Hello World', timestamp: Date.now() };

          await hybridCache.set(key, value, 60);
          const retrieved = await hybridCache.get(key);

          return retrieved !== null &&
                 JSON.stringify(retrieved) === JSON.stringify(value);
        },
      },
      {
        id: 'cache-002',
        name: 'HybridCache - 删除操作',
        service: 'HybridCacheService',
        test: async () => {
          const key = 'test-key-002';
          await hybridCache.set(key, 'test-value', 60);
          await hybridCache.del(key);
          const retrieved = await hybridCache.get(key);

          return retrieved === null;
        },
      },
      {
        id: 'cache-003',
        name: 'HybridCache - 批量删除',
        service: 'HybridCacheService',
        test: async () => {
          await hybridCache.set('prefix:key1', 'value1', 60);
          await hybridCache.set('prefix:key2', 'value2', 60);
          await hybridCache.set('other:key3', 'value3', 60);

          const deleted = await hybridCache.delPattern('prefix:*');

          const key1 = await hybridCache.get('prefix:key1');
          const key2 = await hybridCache.get('prefix:key2');
          const key3 = await hybridCache.get('other:key3');

          return key1 === null && key2 === null && key3 !== null;
        },
      },
      {
        id: 'cache-004',
        name: 'HybridCache - 缓存统计',
        service: 'HybridCacheService',
        test: async () => {
          const stats = hybridCache.getStats();

          return stats !== null &&
                 typeof stats.memorySize === 'number' &&
                 typeof stats.redisConnected === 'boolean';
        },
      },

      // RetryHelper 测试
      {
        id: 'retry-001',
        name: 'RetryHelper - 成功重试',
        service: 'RetryHelperService',
        test: async () => {
          let attemptCount = 0;
          const operation = async () => {
            attemptCount++;
            if (attemptCount < 3) {
              throw new Error('Retry me');
            }
            return 'success';
          };

          const result = await retryHelper.executeWithRetry(operation, {
            maxRetries: 3,
            initialDelayMs: 10,
            logging: false,
          });

          return result.success &&
                 result.result === 'success' &&
                 result.attemptCount === 3;
        },
      },
      {
        id: 'retry-002',
        name: 'RetryHelper - 不可重试错误',
        service: 'RetryHelperService',
        test: async () => {
          const operation = async () => {
            throw new Error('ValidationError: Bad input');
          };

          const result = await retryHelper.executeWithRetry(operation, {
            maxRetries: 3,
            initialDelayMs: 10,
            logging: false,
          });

          return !result.success && result.attemptCount === 1;
        },
      },
      {
        id: 'retry-003',
        name: 'RetryHelper - API调用重试',
        service: 'RetryHelperService',
        test: async () => {
          let attemptCount = 0;
          const operation = async () => {
            attemptCount++;
            if (attemptCount < 2) {
              const error: any = new Error('Network error');
              error.code = 'ECONNREFUSED';
              throw error;
            }
            return { data: 'api response' };
          };

          const result = await retryHelper.retryApiCall(operation, 'test-api');

          return result.success && result.attemptCount === 2;
        },
      },

      // ParallelExecutor 测试
      {
        id: 'parallel-001',
        name: 'ParallelExecutor - 并行执行',
        service: 'ParallelExecutorService',
        test: async () => {
          const tasks = Array.from({ length: 5 }, (_, i) => ({
            id: `task-${i}`,
            operation: async () => {
              await new Promise(resolve => setTimeout(resolve, 10));
              return `result-${i}`;
            },
          }));

          const results = await parallelExecutor.executeAll(tasks, {
            maxConcurrency: 3,
          });

          return results.length === 5 &&
                 results.every(r => r.success);
        },
      },
      {
        id: 'parallel-002',
        name: 'ParallelExecutor - 错误隔离',
        service: 'ParallelExecutorService',
        test: async () => {
          const tasks = [
            {
              id: 'task-1',
              operation: async () => 'success-1',
            },
            {
              id: 'task-2',
              operation: async () => {
                throw new Error('Failed task');
              },
            },
            {
              id: 'task-3',
              operation: async () => 'success-3',
            },
          ];

          const results = await parallelExecutor.executeAll(tasks);

          return results.length === 3 &&
                 results[0].success &&
                 !results[1].success &&
                 results[2].success;
        },
      },
      {
        id: 'parallel-003',
        name: 'ParallelExecutor - 批次执行',
        service: 'ParallelExecutorService',
        test: async () => {
          const tasks = Array.from({ length: 10 }, (_, i) => ({
            id: `task-${i}`,
            operation: async () => `result-${i}`,
          }));

          const results = await parallelExecutor.executeBatch(tasks, 3);

          return results.length === 10 &&
                 results.every(r => r.success);
        },
      },
      {
        id: 'parallel-004',
        name: 'ParallelExecutor - 统计信息',
        service: 'ParallelExecutorService',
        test: async () => {
          const tasks = Array.from({ length: 5 }, (_, i) => ({
            id: `task-${i}`,
            operation: async () => `result-${i}`,
          }));

          const results = await parallelExecutor.executeAll(tasks);
          const stats = parallelExecutor.getStats(results);

          return stats.total === 5 &&
                 stats.success === 5 &&
                 stats.failed === 0;
        },
      },
    ];

    logger.log(`测试用例数: ${testCases.length}\n`);

    let passed = 0;
    let failed = 0;

    // 执行测试
    for (const testCase of testCases) {
      logger.log(`${'─'.repeat(80)}`);
      logger.log(`[${testCase.id}] ${testCase.name}`);
      logger.log(`服务: ${testCase.service}`);

      const startTime = Date.now();
      let testPassed = false;
      let error: string | null = null;

      try {
        testPassed = await testCase.test();

        if (!testPassed) {
          error = '测试断言失败';
        }
      } catch (err: any) {
        error = err.message;
      }

      const duration = Date.now() - startTime;

      if (testPassed) {
        passed++;
        logger.log(`✓ PASSED (${duration}ms)\n`);
      } else {
        failed++;
        logger.error(`✗ FAILED (${duration}ms)`);
        if (error) {
          logger.error(`  错误: ${error}\n`);
        }
      }
    }

    // 输出总结
    logger.log(`${'='.repeat(80)}`);
    logger.log('测试总结');
    logger.log(`${'='.repeat(80)}`);
    logger.log(`总用例数: ${testCases.length}`);
    logger.log(`通过: ${passed} (${((passed / testCases.length) * 100).toFixed(1)}%)`);
    logger.log(`失败: ${failed}`);
    logger.log(`${'='.repeat(80)}\n`);

    // 服务状态检查
    logger.log('服务状态检查:');
    try {
      const cacheStats = hybridCache.getStats();
      logger.log(`  Redis连接: ${cacheStats.redisConnected ? '✓ 已连接' : '✗ 未连接（将使用内存缓存）'}`);
      logger.log(`  内存缓存大小: ${cacheStats.memorySize} 条目`);
    } catch (err: any) {
      logger.warn(`  缓存统计获取失败: ${err.message}`);
    }
    logger.log('');

    // 清理
    logger.log('清理测试数据...');
    await hybridCache.flushAll();
    logger.log('✓ 清理完成\n');

    if (failed === 0) {
      logger.log('🎉 所有 Phase 5.2 服务集成测试通过！');
      logger.log('\n服务验证结果:');
      logger.log('  ✅ HybridCacheService - 工作正常');
      logger.log('  ✅ RetryHelperService - 工作正常');
      logger.log('  ✅ ParallelExecutorService - 工作正常');
      process.exit(0);
    } else {
      logger.error('❌ 部分测试失败');
      process.exit(1);
    }

  } catch (error: any) {
    logger.error('测试初始化失败:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

main();
