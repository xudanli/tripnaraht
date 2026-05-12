// src/agent/context-engine/services/trip-task-memory.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TripTaskMemoryService } from './trip-task-memory.service';
import { RedisService } from '../../../redis/redis.service';

describe('TripTaskMemoryService', () => {
  let service: TripTaskMemoryService;
  let redis: jest.Mocked<RedisService>;

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripTaskMemoryService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<TripTaskMemoryService>(TripTaskMemoryService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('get/set', () => {
    it('应能设置并读取记忆', async () => {
      const memory = {
        tripId: 'trip-1',
        currentPhase: 'route_selection' as const,
        decisionLogSummary: '已选择冰岛环线',
        artifactsRefs: ['route-123'],
        lastUpdated: new Date().toISOString(),
      };
      await service.set(memory);
      redis.get.mockResolvedValue(memory);
      const got = await service.get('trip-1');
      expect(got).toBeTruthy();
      expect(got?.currentPhase).toBe('route_selection');
      expect(got?.decisionLogSummary).toBe('已选择冰岛环线');
    });

    it('不存在的 tripId 应返回 null', async () => {
      redis.get.mockResolvedValue(undefined);
      const got = await service.get('nonexistent');
      expect(got).toBeNull();
    });
  });

  describe('recordReplanLineageAudit', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('skips when no tripId or no replan fields', async () => {
      await service.recordReplanLineageAudit('', {
        requestId: 'r1',
        previous_plan_version: 1,
      });
      await service.recordReplanLineageAudit('trip-1', { requestId: 'r1' });
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('appends replan_lineage to history', async () => {
      redis.get.mockResolvedValue(null);
      await service.recordReplanLineageAudit('trip-1', {
        requestId: 'req-a',
        tripRunId: 'run-b',
        previous_plan_version: 2,
        previous_world_snapshot_hash: 'sha256:x',
        new_plan_version: 3,
      });
      expect(redis.set).toHaveBeenCalled();
      const saved = redis.set.mock.calls[0][1] as { history?: Array<{ event: string }> };
      expect(saved.history?.length).toBe(1);
      expect(saved.history?.[0]?.event).toBe('replan_lineage');
    });
  });

  describe('updateFromWriteBack', () => {
    it('应从 scratchpad 和 artifactsRefs 更新', async () => {
      redis.get.mockResolvedValue(null);
      await service.updateFromWriteBack('trip-1', {
        scratchpad: { planOutline: '第一天：雷克雅未克' },
        artifactsRefs: { route: 'route-456' },
      });
      expect(redis.set).toHaveBeenCalled();
    });

    it('应追加 history 事件（PRD Trip Task 追溯）', async () => {
      redis.get.mockResolvedValue({
        tripId: 'trip-1',
        currentPhase: 'intake',
        decisionLogSummary: '',
        artifactsRefs: [],
        lastUpdated: new Date().toISOString(),
        history: [{ at: '2026-01-01T00:00:00.000Z', event: 'writeback', payload: {} }],
      });
      await service.updateFromWriteBack(
        'trip-1',
        {
          scratchpad: { planOutline: 'outline' },
          phase: 'route_selection',
        },
      );
      const setPayload = redis.set.mock.calls[0][1] as { history?: unknown[] };
      expect(setPayload.history?.length).toBe(2);
      expect(setPayload.history?.[1]?.event).toBe('writeback');
    });
  });

  describe('appendRecoveryAuditEntry / filterRecoveryAuditTail', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('appends recovery_audit_tail rows', async () => {
      redis.get.mockResolvedValue(null);
      await service.appendRecoveryAuditEntry('trip-1', {
        request_id: 'req-1',
        phase: 'initial_failure',
        is_retry: false,
        failure_domain: 'TIMEOUT',
      });
      expect(redis.set).toHaveBeenCalled();
      const saved = redis.set.mock.calls[0][1] as { recovery_audit_tail?: unknown[] };
      expect(saved.recovery_audit_tail?.length).toBe(1);
      expect((saved.recovery_audit_tail?.[0] as any).failure_domain).toBe('TIMEOUT');
    });

    it('filters by failure_domain and is_retry', async () => {
      const mem = {
        tripId: 't1',
        currentPhase: 'decision' as const,
        decisionLogSummary: '',
        artifactsRefs: [],
        lastUpdated: new Date().toISOString(),
        recovery_audit_tail: [
          {
            at: '2026-01-01T00:00:00.000Z',
            request_id: 'a',
            failure_domain: 'TOOL',
            is_retry: true,
            retry_attempt: 1,
          },
          {
            at: '2026-01-01T00:01:00.000Z',
            request_id: 'b',
            failure_domain: 'TIMEOUT',
            is_retry: false,
          },
        ],
      };
      const toolRetries = service.filterRecoveryAuditTail(mem, { failure_domain: 'TOOL', is_retry: true });
      expect(toolRetries).toHaveLength(1);
      expect(toolRetries[0].request_id).toBe('a');
    });
  });
});
