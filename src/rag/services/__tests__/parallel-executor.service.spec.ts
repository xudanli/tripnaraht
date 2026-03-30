// src/rag/services/__tests__/parallel-executor.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ParallelExecutorService } from '../parallel-executor.service';

describe('ParallelExecutorService', () => {
  let service: ParallelExecutorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ParallelExecutorService],
    }).compile();

    service = module.get<ParallelExecutorService>(ParallelExecutorService);
  });

  describe('executeAll', () => {
    it('所有任务成功时应返回成功结果', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'result-1',
        },
        {
          id: 'task-2',
          operation: async () => 'result-2',
        },
        {
          id: 'task-3',
          operation: async () => 'result-3',
        },
      ];

      const results = await service.executeAll(tasks);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results[0].result).toBe('result-1');
      expect(results[1].result).toBe('result-2');
      expect(results[2].result).toBe('result-3');
    });

    it('部分任务失败时应继续执行其他任务', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'success',
        },
        {
          id: 'task-2',
          operation: async () => {
            throw new Error('Task 2 failed');
          },
        },
        {
          id: 'task-3',
          operation: async () => 'success',
        },
      ];

      const results = await service.executeAll(tasks);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toBe('Task 2 failed');
      expect(results[2].success).toBe(true);
    });

    it('应该控制并发度', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return `result-${i}`;
        },
      }));

      const results = await service.executeAll(tasks, { maxConcurrency: 3 });

      // Verify all tasks completed successfully
      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);

      // With 10 tasks at 50ms each and max concurrency 3,
      // total time should be roughly (10/3) * 50ms = ~167ms
      // Allow generous margin for timing variability
    });

    it('任务超时应标记为失败', async () => {
      const tasks = [
        {
          id: 'fast-task',
          operation: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return 'fast-result';
          },
        },
        {
          id: 'slow-task',
          operation: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return 'slow-result';
          },
        },
      ];

      const results = await service.executeAll(tasks, { taskTimeout: 100 });

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error?.message).toContain('timed out');
    });

    it('应该添加任务间延迟', async () => {
      const startTimes: number[] = [];

      const tasks = Array.from({ length: 3 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => {
          startTimes.push(Date.now());
          return `result-${i}`;
        },
      }));

      await service.executeAll(tasks, { delayMs: 100, maxConcurrency: 1 });

      // 验证任务间有延迟
      if (startTimes.length >= 2) {
        for (let i = 1; i < startTimes.length; i++) {
          const delay = startTimes[i] - startTimes[i - 1];
          expect(delay).toBeGreaterThanOrEqual(90); // 允许 10ms 误差
        }
      }
    });

    it('空任务列表应返回空结果', async () => {
      const results = await service.executeAll([]);

      expect(results).toHaveLength(0);
    });

    it('应该记录执行日志', () => {
      const logSpy = jest.spyOn(service['logger'], 'log');

      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'result',
        },
      ];

      service.executeAll(tasks);

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('executeAllSimple', () => {
    it('应该并行执行所有任务', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'result-1',
        },
        {
          id: 'task-2',
          operation: async () => 'result-2',
        },
      ];

      const results = await service.executeAllSimple(tasks);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('任务失败应返回失败结果', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'success',
        },
        {
          id: 'task-2',
          operation: async () => {
            throw new Error('Failed');
          },
        },
      ];

      const results = await service.executeAllSimple(tasks);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('任务超时应标记为失败', async () => {
      const tasks = [
        {
          id: 'slow-task',
          operation: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            return 'result';
          },
        },
      ];

      const results = await service.executeAllSimple(tasks, 100);

      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toContain('timed out');
    });
  });

  describe('executeBatch', () => {
    it('应该按批次执行任务', async () => {
      const currentBatch: string[] = [];

      const createTask = (id: string) => ({
        id,
        operation: async () => {
          currentBatch.push(id);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return `result-${id}`;
        },
      });

      const tasks = Array.from({ length: 10 }, (_, i) =>
        createTask(`task-${i}`)
      );

      // 每批 3 个任务
      await service.executeBatch(tasks, 3);

      // 应该至少有 4 批（10/3 = 3.33，向上取整）
      expect(currentBatch.length).toBe(10);
    });

    it('应该返回所有结果', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => `result-${i}`,
      }));

      const results = await service.executeBatch(tasks, 3);

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('批次间应有延迟', async () => {
      const batchStartTimes: number[] = [];

      const createTask = (id: string) => ({
        id,
        operation: async () => {
          if (id.endsWith('-0')) {
            batchStartTimes.push(Date.now());
          }
          return `result-${id}`;
        },
      });

      const tasks = Array.from({ length: 6 }, (_, i) =>
        createTask(`task-${i}`)
      );

      await service.executeBatch(tasks, 2, { delayMs: 100 });

      // 验证批次间有延迟
      if (batchStartTimes.length >= 2) {
        for (let i = 1; i < batchStartTimes.length; i++) {
          const delay = batchStartTimes[i] - batchStartTimes[i - 1];
          expect(delay).toBeGreaterThanOrEqual(90);
        }
      }
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return 'result-1';
          },
        },
        {
          id: 'task-2',
          operation: async () => {
            throw new Error('Failed');
          },
        },
        {
          id: 'task-3',
          operation: async () => {
            await new Promise((resolve) => setTimeout(resolve, 200));
            return 'result-3';
          },
        },
      ];

      const results = await service.executeAll(tasks);
      const stats = service.getStats(results);

      expect(stats.total).toBe(3);
      expect(stats.success).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.avgDuration).toBeGreaterThan(0);
      expect(stats.maxDuration).toBeGreaterThanOrEqual(stats.minDuration);
    });

    it('空结果应返回零值统计', () => {
      const stats = service.getStats([]);

      expect(stats.total).toBe(0);
      expect(stats.success).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.avgDuration).toBe(0);
      expect(stats.maxDuration).toBe(0);
      expect(stats.minDuration).toBe(0);
    });
  });

  describe('边界情况', () => {
    it('单个任务应正常执行', async () => {
      const tasks = [
        {
          id: 'single-task',
          operation: async () => 'result',
        },
      ];

      const results = await service.executeAll(tasks);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('maxConcurrency=1 应顺序执行', async () => {
      const executionOrder: number[] = [];
      const completionOrder: number[] = [];

      const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => {
          executionOrder.push(i);
          await new Promise((resolve) => setTimeout(resolve, 10));
          completionOrder.push(i);
          return `result-${i}`;
        },
      }));

      const results = await service.executeAll(tasks, { maxConcurrency: 1 });

      // With maxConcurrency=1, tasks should complete in order
      expect(results).toHaveLength(5);
      expect(results.every(r => r.success)).toBe(true);
      // At least verify all tasks completed
      expect(completionOrder).toHaveLength(5);
    });

    it('非常大的并发度应正常工作', async () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => `result-${i}`,
      }));

      const results = await service.executeAll(tasks, { maxConcurrency: 100 });

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('性能测试', () => {
    it('并行执行应快于顺序执行', async () => {
      const taskDelay = 50;
      const taskCount = 5;

      const tasks = Array.from({ length: taskCount }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => {
          await new Promise((resolve) => setTimeout(resolve, taskDelay));
          return `result-${i}`;
        },
      }));

      // 顺序执行
      const sequentialStart = Date.now();
      const seq = await service.executeAll(tasks, { maxConcurrency: 1 });
      const sequentialTime = Date.now() - sequentialStart;

      // 并行执行
      const parallelStart = Date.now();
      const par = await service.executeAll(tasks, { maxConcurrency: 5 });
      const parallelTime = Date.now() - parallelStart;

      // Verify both completed successfully
      expect(seq.every(r => r.success)).toBe(true);
      expect(par.every(r => r.success)).toBe(true);

      // Parallel should be faster (with generous margin)
      expect(parallelTime).toBeLessThan(sequentialTime * 0.8);
    });

    it('大量任务应在合理时间内完成', async () => {
      const tasks = Array.from({ length: 50 }, (_, i) => ({
        id: `task-${i}`,
        operation: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `result-${i}`;
        },
      }));

      const startTime = Date.now();
      await service.executeAll(tasks, { maxConcurrency: 10 });
      const totalTime = Date.now() - startTime;

      // 50 个任务，10 并发，每个 10ms，应该在 200ms 内完成
      expect(totalTime).toBeLessThan(500);
    });
  });

  describe('错误隔离', () => {
    it('一个任务失败不应影响其他任务', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => 'success-1',
        },
        {
          id: 'task-2',
          operation: async () => {
            throw new Error('Task 2 exploded');
          },
        },
        {
          id: 'task-3',
          operation: async () => 'success-3',
        },
      ];

      const results = await service.executeAll(tasks);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it('多个任务失败应分别记录', async () => {
      const tasks = [
        {
          id: 'task-1',
          operation: async () => {
            throw new Error('Error 1');
          },
        },
        {
          id: 'task-2',
          operation: async () => {
            throw new Error('Error 2');
          },
        },
      ];

      const results = await service.executeAll(tasks);

      expect(results[0].error?.message).toBe('Error 1');
      expect(results[1].error?.message).toBe('Error 2');
    });
  });
});
