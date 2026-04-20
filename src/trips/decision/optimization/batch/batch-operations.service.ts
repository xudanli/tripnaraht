/**
 * Decision OS 批量操作服务
 * 
 * 提供:
 * - 批量决策处理
 * - 批量反馈处理
 * - 并发控制
 * - 进度追踪
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

// ========== 类型定义 ==========

export interface BatchRequest<T> {
  id: string;
  data: T;
}

export interface BatchResult<T, R> {
  id: string;
  request: T;
  result?: R;
  error?: string;
  durationMs: number;
}

export interface BatchSummary<T, R> {
  batchId: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  results: BatchResult<T, R>[];
}

export interface BatchOptions {
  concurrency: number;
  stopOnError?: boolean;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  onProgress?: (completed: number, total: number, current: BatchResult<unknown, unknown>) => void;
}

export interface BatchDecisionRequest {
  requestId: string;
  userId: string;
  dsoData: Record<string, unknown>;
}

export interface BatchDecisionResult {
  requestId: string;
  action: string;
  utility: number;
  confidence: number;
}

export interface BatchFeedbackRequest {
  decisionId: string;
  userId: string;
  score: number;
  comment?: string;
}

export interface BatchFeedbackResult {
  decisionId: string;
  processed: boolean;
  learningTriggered: boolean;
}

// ========== 批量执行器 ==========

export class BatchExecutor<T, R> {
  private readonly logger = new Logger(BatchExecutor.name);

  constructor(
    private readonly name: string,
    private readonly processor: (item: T) => Promise<R>,
    private readonly options: BatchOptions = { concurrency: 5 },
  ) {}

  async execute(requests: BatchRequest<T>[]): Promise<BatchSummary<T, R>> {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();
    const results: BatchResult<T, R>[] = [];
    let successCount = 0;
    let failureCount = 0;

    this.logger.log(`[Batch:${this.name}] Starting batch ${batchId} with ${requests.length} requests`);

    const chunks = this.chunkArray(requests, this.options.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(req => this.processWithRetry(req)),
      );

      for (const result of chunkResults) {
        results.push(result);

        if (result.error) {
          failureCount++;
          if (this.options.stopOnError) {
            this.logger.warn(`[Batch:${this.name}] Stopping on error: ${result.error}`);
            break;
          }
        } else {
          successCount++;
        }

        this.options.onProgress?.(
          results.length,
          requests.length,
          result as BatchResult<unknown, unknown>,
        );
      }

      if (this.options.stopOnError && failureCount > 0) break;
    }

    const totalDurationMs = Date.now() - startTime;

    const summary: BatchSummary<T, R> = {
      batchId,
      totalRequests: requests.length,
      successCount,
      failureCount,
      totalDurationMs,
      averageDurationMs: results.length > 0 ? totalDurationMs / results.length : 0,
      results,
    };

    this.logger.log(
      `[Batch:${this.name}] Completed batch ${batchId}: ${successCount}/${requests.length} success, ${totalDurationMs}ms total`,
    );

    return summary;
  }

  private async processWithRetry(request: BatchRequest<T>): Promise<BatchResult<T, R>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    const maxRetries = this.options.retries ?? 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.withTimeout(
          this.processor(request.data),
          this.options.timeoutMs,
        );

        return {
          id: request.id,
          request: request.data,
          result,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          const delay = this.options.retryDelayMs ?? 1000 * (attempt + 1);
          await this.delay(delay);
        }
      }
    }

    return {
      id: request.id,
      request: request.data,
      error: lastError?.message ?? 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs) return promise;

    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs),
      ),
    ]);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== 批量决策服务 ==========

@Injectable()
export class BatchDecisionService {
  private readonly logger = new Logger(BatchDecisionService.name);

  /**
   * Optional DI token to override how each batch request is processed.
   * If not provided, a safe default mock processor is used.
   */
  static readonly PROCESSOR_TOKEN = 'BATCH_DECISION_PROCESSOR';

  constructor(
    @Optional()
    @Inject(BatchDecisionService.PROCESSOR_TOKEN)
    private readonly decisionProcessor?: (req: BatchDecisionRequest) => Promise<BatchDecisionResult>,
  ) {
    if (!this.decisionProcessor) {
      this.decisionProcessor = this.defaultDecisionProcessor.bind(this);
    }
  }

  async processBatch(
    requests: BatchDecisionRequest[],
    options?: Partial<BatchOptions>,
  ): Promise<BatchSummary<BatchDecisionRequest, BatchDecisionResult>> {
    const executor = new BatchExecutor<BatchDecisionRequest, BatchDecisionResult>(
      'Decision',
      this.decisionProcessor!,
      {
        concurrency: options?.concurrency ?? 10,
        retries: options?.retries ?? 1,
        timeoutMs: options?.timeoutMs ?? 5000,
        ...options,
      },
    );

    const batchRequests = requests.map((req, index) => ({
      id: req.requestId || `req-${index}`,
      data: req,
    }));

    return executor.execute(batchRequests);
  }

  private async defaultDecisionProcessor(
    req: BatchDecisionRequest,
  ): Promise<BatchDecisionResult> {
    await this.delay(Math.random() * 50);

    return {
      requestId: req.requestId,
      action: 'ACCEPT_PLAN',
      utility: 0.5 + Math.random() * 0.5,
      confidence: 0.6 + Math.random() * 0.4,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== 批量反馈服务 ==========

@Injectable()
export class BatchFeedbackService {
  private readonly logger = new Logger(BatchFeedbackService.name);

  /**
   * Optional DI token to override how each feedback request is processed.
   * If not provided, a safe default processor is used.
   */
  static readonly PROCESSOR_TOKEN = 'BATCH_FEEDBACK_PROCESSOR';

  constructor(
    @Optional()
    @Inject(BatchFeedbackService.PROCESSOR_TOKEN)
    private readonly feedbackProcessor?: (req: BatchFeedbackRequest) => Promise<BatchFeedbackResult>,
  ) {
    if (!this.feedbackProcessor) {
      this.feedbackProcessor = this.defaultFeedbackProcessor.bind(this);
    }
  }

  async processBatch(
    requests: BatchFeedbackRequest[],
    options?: Partial<BatchOptions>,
  ): Promise<BatchSummary<BatchFeedbackRequest, BatchFeedbackResult>> {
    const executor = new BatchExecutor<BatchFeedbackRequest, BatchFeedbackResult>(
      'Feedback',
      this.feedbackProcessor!,
      {
        concurrency: options?.concurrency ?? 20,
        retries: options?.retries ?? 2,
        timeoutMs: options?.timeoutMs ?? 3000,
        ...options,
      },
    );

    const batchRequests = requests.map((req, index) => ({
      id: req.decisionId || `fb-${index}`,
      data: req,
    }));

    return executor.execute(batchRequests);
  }

  private async defaultFeedbackProcessor(
    req: BatchFeedbackRequest,
  ): Promise<BatchFeedbackResult> {
    await this.delay(Math.random() * 20);

    return {
      decisionId: req.decisionId,
      processed: true,
      learningTriggered: req.score > 0 || req.score < 0,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== 批量导入/导出服务 ==========

@Injectable()
export class BatchDataService {
  private readonly logger = new Logger(BatchDataService.name);

  async importData<T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    options?: Partial<BatchOptions>,
  ): Promise<BatchSummary<T, void>> {
    const executor = new BatchExecutor<T, void>(
      'Import',
      processor,
      {
        concurrency: options?.concurrency ?? 50,
        retries: options?.retries ?? 3,
        ...options,
      },
    );

    const requests = items.map((item, index) => ({
      id: `import-${index}`,
      data: item,
    }));

    return executor.execute(requests);
  }

  async exportData<T>(
    ids: string[],
    fetcher: (id: string) => Promise<T>,
    options?: Partial<BatchOptions>,
  ): Promise<BatchSummary<string, T>> {
    const executor = new BatchExecutor<string, T>(
      'Export',
      fetcher,
      {
        concurrency: options?.concurrency ?? 20,
        retries: options?.retries ?? 1,
        ...options,
      },
    );

    const requests = ids.map(id => ({ id, data: id }));

    return executor.execute(requests);
  }
}

// ========== 批量操作队列 ==========

export interface QueuedBatch<T, R> {
  id: string;
  requests: BatchRequest<T>[];
  options: BatchOptions;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: BatchSummary<T, R>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

@Injectable()
export class BatchQueueService {
  private readonly logger = new Logger(BatchQueueService.name);
  private readonly queue: Map<string, QueuedBatch<unknown, unknown>> = new Map();
  private processing = false;

  async enqueue<T, R>(
    name: string,
    requests: BatchRequest<T>[],
    processor: (item: T) => Promise<R>,
    options?: Partial<BatchOptions>,
  ): Promise<string> {
    const batchId = `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const batch: QueuedBatch<T, R> = {
      id: batchId,
      requests,
      options: { concurrency: 5, ...options },
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    this.queue.set(batchId, batch as QueuedBatch<unknown, unknown>);

    this.logger.log(`[BatchQueue] Enqueued batch ${batchId} with ${requests.length} requests`);

    this.processQueueAsync(processor as (item: unknown) => Promise<unknown>);

    return batchId;
  }

  getBatchStatus<T, R>(batchId: string): QueuedBatch<T, R> | undefined {
    return this.queue.get(batchId) as QueuedBatch<T, R> | undefined;
  }

  getQueueStats(): {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    let pending = 0, processing = 0, completed = 0, failed = 0;

    for (const batch of this.queue.values()) {
      switch (batch.status) {
        case 'pending': pending++; break;
        case 'processing': processing++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
    }

    return { pending, processing, completed, failed };
  }

  private async processQueueAsync(processor: (item: unknown) => Promise<unknown>): Promise<void> {
    if (this.processing) return;

    this.processing = true;

    try {
      for (const [batchId, batch] of this.queue.entries()) {
        if (batch.status !== 'pending') continue;

        batch.status = 'processing';
        batch.startedAt = new Date().toISOString();

        try {
          const executor = new BatchExecutor(
            'Queue',
            processor,
            batch.options,
          );

          batch.result = await executor.execute(batch.requests);
          batch.status = 'completed';
        } catch (error) {
          batch.status = 'failed';
          this.logger.error(`[BatchQueue] Batch ${batchId} failed: ${(error as Error).message}`);
        }

        batch.completedAt = new Date().toISOString();
      }
    } finally {
      this.processing = false;
    }
  }
}
