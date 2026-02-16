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

  describe('updateFromWriteBack', () => {
    it('应从 scratchpad 和 artifactsRefs 更新', async () => {
      redis.get.mockResolvedValue(null);
      await service.updateFromWriteBack('trip-1', {
        scratchpad: { planOutline: '第一天：雷克雅未克' },
        artifactsRefs: { route: 'route-456' },
      });
      expect(redis.set).toHaveBeenCalled();
    });
  });
});
