import { ExplorationCheckJobStoreService } from './exploration-check-job.store';

describe('ExplorationCheckJobStoreService', () => {
  const jobId = 'job-11111111-1111-1111-1111-111111111111';
  const baseInput = {
    jobId,
    scenarioId: 'scenario-1',
    tripId: 'trip-1',
    userId: 'user-1',
  };

  it('persists jobs in memory when cache is unavailable', async () => {
    const store = new ExplorationCheckJobStoreService();
    const created = await store.create({ ...baseInput, status: 'PENDING' });
    expect(created.status).toBe('PENDING');

    const fetched = await store.get(jobId);
    expect(fetched?.tripId).toBe('trip-1');

    const updated = await store.update(jobId, { status: 'COMPLETED', completedAt: '2026-07-04T00:00:00.000Z' });
    expect(updated?.status).toBe('COMPLETED');
  });

  it('reads jobs from Redis cache after process restart simulation', async () => {
    const redis = new Map<string, unknown>();
    const cacheService = {
      generateKey: (prefix: string, id: string) => `${prefix}:${id}`,
      set: jest.fn(async (key: string, value: unknown) => {
        redis.set(key, value);
      }),
      get: jest.fn(async (key: string) => redis.get(key) ?? null),
    };

    const writer = new ExplorationCheckJobStoreService(cacheService as any);
    await writer.create({ ...baseInput, status: 'RUNNING' });
    await writer.update(jobId, {
      status: 'COMPLETED',
      result: { totalIssueCount: 2, checkDurationMs: 1200 },
    });

    const reader = new ExplorationCheckJobStoreService(cacheService as any);
    const job = await reader.get(jobId);
    expect(job?.status).toBe('COMPLETED');
    expect(job?.result?.totalIssueCount).toBe(2);
    expect(cacheService.set).toHaveBeenCalled();
  });

  it('returns undefined for unknown job id', async () => {
    const store = new ExplorationCheckJobStoreService();
    expect(await store.get('missing')).toBeUndefined();
  });
});
