import {
  BatchExecutor,
  BatchDecisionService,
  BatchFeedbackService,
  BatchDataService,
  BatchQueueService,
} from './batch-operations.service';

describe('BatchExecutor', () => {
  describe('execute', () => {
    it('should process all requests', async () => {
      const processor = jest.fn().mockResolvedValue({ success: true });
      const executor = new BatchExecutor('Test', processor, { concurrency: 2 });

      const requests = [
        { id: '1', data: { value: 1 } },
        { id: '2', data: { value: 2 } },
        { id: '3', data: { value: 3 } },
      ];

      const summary = await executor.execute(requests);

      expect(summary.totalRequests).toBe(3);
      expect(summary.successCount).toBe(3);
      expect(summary.failureCount).toBe(0);
      expect(processor).toHaveBeenCalledTimes(3);
    });

    it('should handle failures', async () => {
      const processor = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ success: true });

      const executor = new BatchExecutor('Test', processor, { concurrency: 1 });

      const requests = [
        { id: '1', data: {} },
        { id: '2', data: {} },
        { id: '3', data: {} },
      ];

      const summary = await executor.execute(requests);

      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(1);
      expect(summary.results[1].error).toBe('Failed');
    });

    it('should stop on error if configured', async () => {
      const processor = jest.fn()
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Stop here'));

      const executor = new BatchExecutor('Test', processor, {
        concurrency: 1,
        stopOnError: true,
      });

      const requests = [
        { id: '1', data: {} },
        { id: '2', data: {} },
        { id: '3', data: {} },
      ];

      const summary = await executor.execute(requests);

      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.results.length).toBe(2);
    });

    it('should retry on failure', async () => {
      const processor = jest.fn()
        .mockRejectedValueOnce(new Error('Temp failure'))
        .mockResolvedValueOnce({ success: true });

      const executor = new BatchExecutor('Test', processor, {
        concurrency: 1,
        retries: 1,
        retryDelayMs: 10,
      });

      const summary = await executor.execute([{ id: '1', data: {} }]);

      expect(summary.successCount).toBe(1);
      expect(processor).toHaveBeenCalledTimes(2);
    });

    it('should timeout operations', async () => {
      const processor = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ done: true }), 500)),
      );

      const executor = new BatchExecutor('Test', processor, {
        concurrency: 1,
        timeoutMs: 50,
      });

      const summary = await executor.execute([{ id: '1', data: {} }]);

      expect(summary.failureCount).toBe(1);
      expect(summary.results[0].error).toBe('Operation timed out');
    });

    it('should report progress', async () => {
      const processor = jest.fn().mockResolvedValue({ done: true });
      const onProgress = jest.fn();

      const executor = new BatchExecutor('Test', processor, {
        concurrency: 1,
        onProgress,
      });

      await executor.execute([
        { id: '1', data: {} },
        { id: '2', data: {} },
      ]);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2, expect.any(Object));
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2, expect.any(Object));
    });

    it('should respect concurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const processor = jest.fn().mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 50));
        concurrent--;
        return { done: true };
      });

      const executor = new BatchExecutor('Test', processor, { concurrency: 3 });

      await executor.execute([
        { id: '1', data: {} },
        { id: '2', data: {} },
        { id: '3', data: {} },
        { id: '4', data: {} },
        { id: '5', data: {} },
      ]);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should track duration per request', async () => {
      const processor = jest.fn().mockImplementation(
        () => new Promise(r => setTimeout(() => r({ done: true }), 50)),
      );

      const executor = new BatchExecutor('Test', processor, { concurrency: 1 });

      const summary = await executor.execute([{ id: '1', data: {} }]);

      expect(summary.results[0].durationMs).toBeGreaterThanOrEqual(45);
    });
  });
});

describe('BatchDecisionService', () => {
  let service: BatchDecisionService;

  beforeEach(() => {
    service = new BatchDecisionService();
  });

  it('should process batch decisions', async () => {
    const requests = [
      { requestId: 'req-1', userId: 'user-1', dsoData: {} },
      { requestId: 'req-2', userId: 'user-2', dsoData: {} },
    ];

    const summary = await service.processBatch(requests);

    expect(summary.successCount).toBe(2);
    expect(summary.results[0].result?.requestId).toBe('req-1');
    expect(summary.results[1].result?.requestId).toBe('req-2');
  });

  it('should use custom processor', async () => {
    const customProcessor = jest.fn().mockResolvedValue({
      requestId: 'custom',
      action: 'CUSTOM_ACTION',
      utility: 1.0,
      confidence: 1.0,
    });

    const customService = new BatchDecisionService(customProcessor);

    const summary = await customService.processBatch([
      { requestId: 'req-1', userId: 'user-1', dsoData: {} },
    ]);

    expect(summary.results[0].result?.action).toBe('CUSTOM_ACTION');
  });

  it('should apply custom options', async () => {
    const requests = Array.from({ length: 10 }, (_, i) => ({
      requestId: `req-${i}`,
      userId: `user-${i}`,
      dsoData: {},
    }));

    const summary = await service.processBatch(requests, {
      concurrency: 5,
    });

    expect(summary.successCount).toBe(10);
  });
});

describe('BatchFeedbackService', () => {
  let service: BatchFeedbackService;

  beforeEach(() => {
    service = new BatchFeedbackService();
  });

  it('should process batch feedback', async () => {
    const requests = [
      { decisionId: 'dec-1', userId: 'user-1', score: 5 },
      { decisionId: 'dec-2', userId: 'user-2', score: 3 },
    ];

    const summary = await service.processBatch(requests);

    expect(summary.successCount).toBe(2);
    expect(summary.results[0].result?.processed).toBe(true);
  });

  it('should trigger learning for non-zero scores', async () => {
    const requests = [
      { decisionId: 'dec-1', userId: 'user-1', score: 5 },
      { decisionId: 'dec-2', userId: 'user-2', score: 0 },
    ];

    const summary = await service.processBatch(requests);

    expect(summary.results[0].result?.learningTriggered).toBe(true);
    expect(summary.results[1].result?.learningTriggered).toBe(false);
  });
});

describe('BatchDataService', () => {
  let service: BatchDataService;

  beforeEach(() => {
    service = new BatchDataService();
  });

  describe('importData', () => {
    it('should import all items', async () => {
      const processor = jest.fn().mockResolvedValue(undefined);

      const summary = await service.importData(
        [{ name: 'item1' }, { name: 'item2' }],
        processor,
      );

      expect(summary.successCount).toBe(2);
      expect(processor).toHaveBeenCalledTimes(2);
    });
  });

  describe('exportData', () => {
    it('should export all items', async () => {
      const fetcher = jest.fn().mockImplementation(id => ({ id, data: `data-${id}` }));

      const summary = await service.exportData(['id-1', 'id-2'], fetcher);

      expect(summary.successCount).toBe(2);
      expect(summary.results[0].result).toEqual({ id: 'id-1', data: 'data-id-1' });
    });
  });
});

describe('BatchQueueService', () => {
  let service: BatchQueueService;

  beforeEach(() => {
    service = new BatchQueueService();
  });

  describe('enqueue', () => {
    it('should enqueue batch and return id', async () => {
      const processor = jest.fn().mockResolvedValue({ done: true });

      const batchId = await service.enqueue(
        'Test',
        [{ id: '1', data: {} }],
        processor,
      );

      expect(batchId).toMatch(/^queue_/);
    });

    it('should process queued batch', async () => {
      const processor = jest.fn().mockResolvedValue({ done: true });

      const batchId = await service.enqueue(
        'Test',
        [{ id: '1', data: {} }],
        processor,
      );

      await new Promise(r => setTimeout(r, 100));

      const status = service.getBatchStatus(batchId);
      expect(status?.status).toBe('completed');
      expect(status?.result?.successCount).toBe(1);
    });
  });

  describe('getBatchStatus', () => {
    it('should return undefined for non-existent batch', () => {
      const status = service.getBatchStatus('non-existent');
      expect(status).toBeUndefined();
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const processor = jest.fn().mockResolvedValue({ done: true });

      await service.enqueue('Test', [{ id: '1', data: {} }], processor);
      await new Promise(r => setTimeout(r, 100));

      const stats = service.getQueueStats();
      expect(stats.completed).toBe(1);
    });
  });
});
