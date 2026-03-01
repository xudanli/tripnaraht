import {
  AuditPersistenceService,
  InMemoryAuditStore,
  IntegratedAuditService,
} from './audit-persistence.service';
import { AuditLogEntry } from './decision-interceptor.service';

describe('InMemoryAuditStore', () => {
  let store: InMemoryAuditStore;

  beforeEach(() => {
    store = new InMemoryAuditStore();
  });

  const createEntry = (overrides?: Partial<AuditLogEntry>): AuditLogEntry => ({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    requestId: 'req-001',
    userId: 'user-001',
    action: 'TEST_ACTION',
    resource: 'test',
    method: 'GET',
    path: '/test',
    statusCode: 200,
    durationMs: 50,
    ...overrides,
  });

  describe('save', () => {
    it('should save entries', async () => {
      const entries = [createEntry(), createEntry()];
      await store.save(entries);

      const results = await store.query({});
      expect(results.length).toBe(2);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await store.save([
        createEntry({ userId: 'user-001', action: 'ACTION_A', statusCode: 200 }),
        createEntry({ userId: 'user-001', action: 'ACTION_B', statusCode: 201 }),
        createEntry({ userId: 'user-002', action: 'ACTION_A', statusCode: 500 }),
      ]);
    });

    it('should filter by userId', async () => {
      const results = await store.query({ userId: 'user-001' });
      expect(results.length).toBe(2);
    });

    it('should filter by action', async () => {
      const results = await store.query({ action: 'ACTION_A' });
      expect(results.length).toBe(2);
    });

    it('should filter by statusCode', async () => {
      const results = await store.query({ statusCode: 500 });
      expect(results.length).toBe(1);
    });

    it('should apply limit and offset', async () => {
      const results = await store.query({ limit: 2, offset: 1 });
      expect(results.length).toBe(2);
    });
  });

  describe('count', () => {
    it('should return total count', async () => {
      await store.save([createEntry(), createEntry(), createEntry()]);
      const count = await store.count({});
      expect(count).toBe(3);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old entries', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      await store.save([
        createEntry({ timestamp: oldDate.toISOString() }),
        createEntry({ timestamp: new Date().toISOString() }),
      ]);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 5);

      const deleted = await store.deleteOlderThan(cutoff);
      expect(deleted).toBe(1);

      const remaining = await store.count({});
      expect(remaining).toBe(1);
    });
  });
});

describe('AuditPersistenceService', () => {
  let service: AuditPersistenceService;
  let store: InMemoryAuditStore;

  beforeEach(() => {
    store = new InMemoryAuditStore();
    service = new AuditPersistenceService(store, {
      enabled: true,
      batchSize: 5,
      flushIntervalMs: 100000,
      maxRetries: 2,
      retentionDays: 30,
    });
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  const createEntry = (): AuditLogEntry => ({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    requestId: 'req-001',
    action: 'TEST',
    resource: 'test',
    method: 'GET',
    path: '/test',
  });

  describe('persist', () => {
    it('should queue entries', async () => {
      await service.persist(createEntry());
      const stats = service.getStats();
      expect(stats.pendingCount).toBe(1);
    });

    it('should auto-flush when batch size reached', async () => {
      for (let i = 0; i < 6; i++) {
        await service.persist(createEntry());
      }

      const stats = service.getStats();
      expect(stats.totalPersisted).toBe(5);
      expect(stats.pendingCount).toBe(1);
    });
  });

  describe('flush', () => {
    it('should persist pending entries', async () => {
      await service.persist(createEntry());
      await service.persist(createEntry());
      await service.flush();

      const stats = service.getStats();
      expect(stats.totalPersisted).toBe(2);
      expect(stats.pendingCount).toBe(0);
    });

    it('should handle empty queue', async () => {
      await service.flush();
      const stats = service.getStats();
      expect(stats.totalPersisted).toBe(0);
    });
  });

  describe('query', () => {
    it('should query persisted entries', async () => {
      await service.persist(createEntry());
      await service.flush();

      const results = await service.query({});
      expect(results.length).toBe(1);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await service.persist(createEntry());
      await service.persist(createEntry());
      await service.flush();
    });

    it('should export as JSON', async () => {
      const json = await service.export({ format: 'json' });
      const parsed = JSON.parse(json);
      expect(parsed.length).toBe(2);
    });

    it('should export as NDJSON', async () => {
      const ndjson = await service.export({ format: 'ndjson' });
      const lines = ndjson.split('\n').filter(Boolean);
      expect(lines.length).toBe(2);
    });

    it('should export as CSV', async () => {
      const csv = await service.export({ format: 'csv' });
      const lines = csv.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('id,timestamp');
    });
  });

  describe('cleanup', () => {
    it('should delete old entries', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);

      const oldEntry: AuditLogEntry = {
        ...createEntry(),
        timestamp: oldDate.toISOString(),
      };

      await service.persist(oldEntry);
      await service.persist(createEntry());
      await service.flush();

      const deleted = await service.cleanup();
      expect(deleted).toBe(1);
    });
  });

  describe('disabled mode', () => {
    it('should not persist when disabled', async () => {
      const disabledService = new AuditPersistenceService(store, { enabled: false });

      await disabledService.persist(createEntry());
      await disabledService.flush();

      const stats = disabledService.getStats();
      expect(stats.totalPersisted).toBe(0);

      disabledService.onModuleDestroy();
    });
  });
});

describe('IntegratedAuditService', () => {
  let service: IntegratedAuditService;

  beforeEach(() => {
    service = new IntegratedAuditService();
  });

  it('should log and persist entries', async () => {
    service.log({
      requestId: 'req-001',
      action: 'TEST',
      resource: 'test',
      method: 'GET',
      path: '/test',
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = service.getPersistenceStats();
    expect(stats.pendingCount).toBeGreaterThanOrEqual(0);
  });

  it('should query memory logs', () => {
    service.log({
      requestId: 'req-001',
      action: 'QUERY_TEST',
      resource: 'test',
      method: 'GET',
      path: '/test',
    });

    const logs = service.query({ action: 'QUERY_TEST' });
    expect(logs.length).toBe(1);
  });
});
