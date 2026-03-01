/**
 * 并行采样服务
 *
 * P2.2 优化：使用 Worker Pool 实现并行 Monte Carlo 采样
 *
 * 策略：
 * - 将采样任务分割成多个批次
 * - 使用 Promise.all 并行执行
 * - 支持动态工作线程数调整
 *
 * 注意：Node.js 单线程限制，这里使用异步并行而非真正的多线程
 * 对于 CPU 密集型任务，建议使用 worker_threads 模块
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ParallelConfig {
  workerCount: number;
  batchSize: number;
  timeout: number;
  retryCount: number;
  enableLoadBalancing: boolean;
}

export interface SamplingTask<TInput, TOutput> {
  id: string;
  input: TInput;
  priority?: number;
}

export interface SamplingResult<TOutput> {
  taskId: string;
  output: TOutput;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface ParallelSamplingStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDurationMs: number;
  avgTaskDurationMs: number;
  throughput: number;
  workerUtilization: number[];
}

const DEFAULT_CONFIG: ParallelConfig = {
  workerCount: 4,
  batchSize: 250,
  timeout: 30000,
  retryCount: 1,
  enableLoadBalancing: true,
};

@Injectable()
export class ParallelSamplerService {
  private readonly logger = new Logger(ParallelSamplerService.name);
  private config: ParallelConfig = DEFAULT_CONFIG;
  private workerLoad: number[] = [];
  private isRunning = false;

  constructor() {
    this.workerLoad = new Array(this.config.workerCount).fill(0);
  }

  configure(config: Partial<ParallelConfig>): void {
    this.config = { ...this.config, ...config };
    this.workerLoad = new Array(this.config.workerCount).fill(0);
  }

  /**
   * 并行执行采样任务
   */
  async runParallel<TInput, TOutput>(
    tasks: SamplingTask<TInput, TOutput>[],
    processor: (input: TInput) => Promise<TOutput>,
  ): Promise<{
    results: SamplingResult<TOutput>[];
    stats: ParallelSamplingStats;
  }> {
    if (tasks.length === 0) {
      return {
        results: [],
        stats: this.createEmptyStats(),
      };
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results: SamplingResult<TOutput>[] = [];

    const sortedTasks = this.config.enableLoadBalancing
      ? [...tasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      : tasks;

    const batches = this.splitIntoBatches(sortedTasks, this.config.workerCount);

    this.logger.debug(
      `[ParallelSampler] 启动并行采样: ${tasks.length} 任务, ${batches.length} 批次`,
    );

    const batchPromises = batches.map((batch, workerIdx) =>
      this.processBatch(batch, processor, workerIdx),
    );

    const batchResults = await Promise.all(batchPromises);

    for (const batchResult of batchResults) {
      results.push(...batchResult);
    }

    this.isRunning = false;
    const totalDurationMs = Date.now() - startTime;

    const stats = this.computeStats(results, totalDurationMs);

    this.logger.debug(
      `[ParallelSampler] 完成: ${stats.completedTasks}/${stats.totalTasks}, ` +
        `耗时 ${totalDurationMs}ms, 吞吐量 ${stats.throughput.toFixed(1)}/s`,
    );

    return { results, stats };
  }

  /**
   * 并行 Monte Carlo 采样
   */
  async parallelMonteCarlo<TSample, TResult>(
    sampleCount: number,
    sampler: () => TSample,
    evaluator: (sample: TSample) => TResult,
  ): Promise<{
    samples: TSample[];
    results: TResult[];
    stats: ParallelSamplingStats;
  }> {
    const tasks: SamplingTask<number, { sample: TSample; result: TResult }>[] = [];

    for (let i = 0; i < sampleCount; i++) {
      tasks.push({ id: `mc_${i}`, input: i });
    }

    const processor = async (_: number) => {
      const sample = sampler();
      const result = evaluator(sample);
      return { sample, result };
    };

    const { results, stats } = await this.runParallel(tasks, processor);

    const samples: TSample[] = [];
    const evalResults: TResult[] = [];

    for (const r of results) {
      if (r.success) {
        samples.push(r.output.sample);
        evalResults.push(r.output.result);
      }
    }

    return { samples, results: evalResults, stats };
  }

  /**
   * 流式并行处理（适用于大数据集）
   */
  async *streamParallel<TInput, TOutput>(
    tasks: AsyncIterable<SamplingTask<TInput, TOutput>>,
    processor: (input: TInput) => Promise<TOutput>,
  ): AsyncGenerator<SamplingResult<TOutput>> {
    let batch: SamplingTask<TInput, TOutput>[] = [];

    for await (const task of tasks) {
      batch.push(task);

      if (batch.length >= this.config.batchSize) {
        const { results } = await this.runParallel(batch, processor);
        for (const result of results) {
          yield result;
        }
        batch = [];
      }
    }

    if (batch.length > 0) {
      const { results } = await this.runParallel(batch, processor);
      for (const result of results) {
        yield result;
      }
    }
  }

  /**
   * 带重试的并行执行
   */
  async runWithRetry<TInput, TOutput>(
    tasks: SamplingTask<TInput, TOutput>[],
    processor: (input: TInput) => Promise<TOutput>,
  ): Promise<{
    results: SamplingResult<TOutput>[];
    retried: number;
  }> {
    const { results } = await this.runParallel(tasks, processor);

    const failedTasks = results
      .filter((r) => !r.success)
      .map((r) => tasks.find((t) => t.id === r.taskId))
      .filter((t): t is SamplingTask<TInput, TOutput> => t !== undefined);

    if (failedTasks.length === 0 || this.config.retryCount === 0) {
      return { results, retried: 0 };
    }

    this.logger.debug(`[ParallelSampler] 重试 ${failedTasks.length} 个失败任务`);

    const { results: retryResults } = await this.runParallel(failedTasks, processor);

    const finalResults = results.map((r) => {
      if (!r.success) {
        const retried = retryResults.find((rr) => rr.taskId === r.taskId);
        if (retried) return retried;
      }
      return r;
    });

    return { results: finalResults, retried: failedTasks.length };
  }

  /**
   * 获取当前负载
   */
  getWorkerLoad(): number[] {
    return [...this.workerLoad];
  }

  /**
   * 是否正在运行
   */
  isProcessing(): boolean {
    return this.isRunning;
  }

  // ========== 私有方法 ==========

  private splitIntoBatches<T>(items: T[], batchCount: number): T[][] {
    const batches: T[][] = Array.from({ length: batchCount }, () => []);

    items.forEach((item, idx) => {
      batches[idx % batchCount].push(item);
    });

    return batches.filter((b) => b.length > 0);
  }

  private async processBatch<TInput, TOutput>(
    batch: SamplingTask<TInput, TOutput>[],
    processor: (input: TInput) => Promise<TOutput>,
    workerIdx: number,
  ): Promise<SamplingResult<TOutput>[]> {
    const results: SamplingResult<TOutput>[] = [];
    this.workerLoad[workerIdx] = batch.length;

    for (const task of batch) {
      const startTime = Date.now();

      try {
        const output = await this.withTimeout(
          processor(task.input),
          this.config.timeout,
        );

        results.push({
          taskId: task.id,
          output,
          durationMs: Date.now() - startTime,
          success: true,
        });
      } catch (error) {
        results.push({
          taskId: task.id,
          output: undefined as unknown as TOutput,
          durationMs: Date.now() - startTime,
          success: false,
          error: (error as Error).message,
        });
      }

      this.workerLoad[workerIdx]--;
    }

    return results;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`任务超时 (${timeoutMs}ms)`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private computeStats(
    results: SamplingResult<unknown>[],
    totalDurationMs: number,
  ): ParallelSamplingStats {
    const completed = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);
    const totalTaskDuration = results.reduce((sum, r) => sum + r.durationMs, 0);

    return {
      totalTasks: results.length,
      completedTasks: completed.length,
      failedTasks: failed.length,
      totalDurationMs,
      avgTaskDurationMs: results.length > 0 ? totalTaskDuration / results.length : 0,
      throughput: totalDurationMs > 0 ? (completed.length / totalDurationMs) * 1000 : 0,
      workerUtilization: this.workerLoad.map((load) => load / this.config.batchSize),
    };
  }

  private createEmptyStats(): ParallelSamplingStats {
    return {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      totalDurationMs: 0,
      avgTaskDurationMs: 0,
      throughput: 0,
      workerUtilization: [],
    };
  }
}
