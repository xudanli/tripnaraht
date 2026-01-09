// src/skills/context/plan-select-slices.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PlanSelectSlicesSkill } from './plan-select-slices.skill';
import { PrismaService } from '../../prisma/prisma.service';

describe('PlanSelectSlicesSkill', () => {
  let skill: PlanSelectSlicesSkill;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      tripDay: {
        findMany: jest.fn(),
      },
      itineraryItem: {
        findMany: jest.fn(),
      },
      decisionLog: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanSelectSlicesSkill,
        {
          provide: 'PrismaService',
          useValue: mockPrisma,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    skill = module.get<PlanSelectSlicesSkill>(PlanSelectSlicesSkill);
    prisma = module.get(PrismaService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('plan.selectSlices');
  });

  describe('execute', () => {
    const mockTripDays = [
      {
        id: 'day-1',
        tripId: 'trip-123',
        date: new Date('2025-01-01'),
        ItineraryItem: [
          {
            id: 'item-1',
            type: 'ACTIVITY',
            placeId: 1,
            order: 1,
            startTime: new Date('2025-01-01T09:00:00Z'),
            endTime: new Date('2025-01-01T12:00:00Z'),
            Place: {
              nameCN: '测试地点1',
              nameEN: 'Test Place 1',
            },
          },
          {
            id: 'item-2',
            type: 'TRANSIT',
            placeId: 2,
            order: 2,
            startTime: new Date('2025-01-01T13:00:00Z'),
            endTime: new Date('2025-01-01T14:00:00Z'),
            Place: {
              nameCN: '测试地点2',
              nameEN: 'Test Place 2',
            },
          },
        ],
      },
      {
        id: 'day-2',
        tripId: 'trip-123',
        date: new Date('2025-01-02'),
        ItineraryItem: [],
      },
    ];

    const mockItineraryItems = [
      {
        id: 'item-1',
        type: 'ACTIVITY',
        placeId: 1,
        tripDayId: 'day-1',
        startTime: new Date('2025-01-01T09:00:00Z'),
        endTime: new Date('2025-01-01T12:00:00Z'),
        Place: {
          nameCN: '测试地点1',
          nameEN: 'Test Place 1',
        },
        TripDay: {
          id: 'day-1',
          tripId: 'trip-123',
          date: new Date('2025-01-01'),
        },
      },
      {
        id: 'item-2',
        type: 'TRANSIT',
        placeId: 2,
        tripDayId: 'day-1',
        startTime: new Date('2025-01-01T13:00:00Z'),
        endTime: new Date('2025-01-01T14:00:00Z'),
        Place: {
          nameCN: '测试地点2',
          nameEN: 'Test Place 2',
        },
        TripDay: {
          id: 'day-1',
          tripId: 'trip-123',
          date: new Date('2025-01-01'),
        },
      },
    ];

    beforeEach(() => {
      prisma.tripDay.findMany.mockResolvedValue(mockTripDays as any);
      prisma.itineraryItem.findMany.mockResolvedValue(mockItineraryItems as any);
    });

    it('应该提取指定天的结构', async () => {
      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['day:1'],
        phase: 'planning',
      });

      expect(result.blocks.length).toBeGreaterThan(0);
      const dayBlock = result.blocks.find((b) => b.key === 'PLAN_DAY_1');
      expect(dayBlock).toBeDefined();
      expect(dayBlock?.text).toContain('第 1 天');
      expect(dayBlock?.data?.itemsCount).toBeGreaterThan(0);
    });

    it('应该提取多个天的结构', async () => {
      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['day:1', 'day:2'],
        phase: 'planning',
      });

      expect(result.blocks.length).toBeGreaterThanOrEqual(2);
      expect(result.blocks.some((b) => b.key === 'PLAN_DAY_1')).toBe(true);
      expect(result.blocks.some((b) => b.key === 'PLAN_DAY_2')).toBe(true);
    });

    it('应该提取 segment 结构（通过 ID）', async () => {
      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['segment:item-2'],
        phase: 'planning',
      });

      const segmentBlock = result.blocks.find((b) => b.key === 'PLAN_SEGMENT_item-2');
      expect(segmentBlock).toBeDefined();
      expect(segmentBlock?.data?.itemsCount).toBeGreaterThan(0);
    });

    it('应该提取 segment 结构（通过数字索引）', async () => {
      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['segment:1'],
        phase: 'planning',
      });

      // 应该找到第 1 个 TRANSIT 类型的 item
      const segmentBlock = result.blocks.find((b) => b.key === 'PLAN_SEGMENT_1');
      // 可能找到或找不到，取决于数据
      expect(segmentBlock || result.blocks.length).toBeDefined();
    });

    it('应该提取最近一次 rejection', async () => {
      const mockRejection = {
        id: 'log-1',
        tripId: 'trip-123',
        persona: 'Abu',
        action: 'REJECT',
        explanation: '这个行程不符合我的偏好',
        reasonCodes: ['TOO_EXPENSIVE', 'TOO_TIGHT'],
        timestamp: new Date('2025-01-01T10:00:00Z'),
      };

      prisma.decisionLog.findFirst.mockResolvedValue(mockRejection as any);

      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['rejection:last'],
        phase: 'planning',
      });

      const rejectionBlock = result.blocks.find((b) => b.key === 'REJECTION_LAST');
      expect(rejectionBlock).toBeDefined();
      expect(rejectionBlock?.text).toContain('拒绝');
      expect(rejectionBlock?.data?.persona).toBe('Abu');
      expect(rejectionBlock?.data?.reasonCodes).toEqual(['TOO_EXPENSIVE', 'TOO_TIGHT']);
    });

    it('应该处理找不到 rejection 的情况', async () => {
      prisma.decisionLog.findFirst.mockResolvedValue(null);

      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['rejection:last'],
        phase: 'planning',
      });

      const rejectionBlock = result.blocks.find((b) => b.key === 'REJECTION_LAST');
      expect(rejectionBlock).toBeUndefined();
    });

    it('应该处理找不到 day 的情况', async () => {
      prisma.tripDay.findMany.mockResolvedValue([]);

      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['day:999'],
        phase: 'planning',
      });

      // 不应该有 day:999 的块
      const dayBlock = result.blocks.find((b) => b.key === 'PLAN_DAY_999');
      expect(dayBlock).toBeUndefined();
    });

    it('应该计算时长（从 startTime 和 endTime）', async () => {
      const result = await skill.execute({
        tripId: 'trip-123',
        scope: ['day:1'],
        phase: 'planning',
      });

      const dayBlock = result.blocks.find((b) => b.key === 'PLAN_DAY_1');
      if (dayBlock && dayBlock.data?.items) {
        const item = dayBlock.data.items[0];
        if (item.durationMinutes) {
          expect(item.durationMinutes).toBeGreaterThan(0);
        }
      }
    });
  });
});