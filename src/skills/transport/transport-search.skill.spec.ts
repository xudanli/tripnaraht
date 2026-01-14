// src/skills/transport/transport-search.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TransportSearchSkill } from './transport-search.skill';
import { TransportRoutingService } from '../../transport/transport-routing.service';

describe('TransportSearchSkill', () => {
  let skill: TransportSearchSkill;
  let transportRoutingService: jest.Mocked<TransportRoutingService>;

  beforeEach(async () => {
    const mockTransportRoutingService = {
      planRoute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportSearchSkill,
        {
          provide: TransportRoutingService,
          useValue: mockTransportRoutingService,
        },
      ],
    }).compile();

    skill = module.get<TransportSearchSkill>(TransportSearchSkill);
    transportRoutingService = module.get(TransportRoutingService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('transport.search');
    expect(skill.metadata.description).toBe('搜索两点之间的交通路线');
  });

  describe('execute', () => {
    it('应该成功搜索交通路线', async () => {
      const mockRecommendation = {
        options: [
          {
            mode: 'drive',
            durationMinutes: 30,
            walkDistance: 0,
            distanceMeters: 15000,
            steps: [
              {
                instruction: '从起点出发',
                distance: 5000,
              },
            ],
          },
          {
            mode: 'transit',
            durationMinutes: 45,
            walkDistance: 500,
          },
        ],
      };

      transportRoutingService.planRoute.mockResolvedValue(
        mockRecommendation as any,
      );

      const result = await skill.execute({
        origin: { lat: 64.1, lng: -21.9 },
        destination: { lat: 64.2, lng: -21.8 },
        mode: 'mixed',
      });

      expect(transportRoutingService.planRoute).toHaveBeenCalledWith(
        64.1,
        -21.9,
        64.2,
        -21.8,
        {
          budgetSensitivity: 'MEDIUM',
          timeSensitivity: 'MEDIUM',
          hasLuggage: false,
          hasElderly: false,
          isMovingDay: false,
          isRaining: false,
          hasLimitedMobility: false,
        },
      );
      expect(result.options).toHaveLength(2);
      expect(result.options[0].mode).toBe('drive');
      expect(result.options[0].duration_minutes).toBe(30);
      expect(result.best_option).toEqual(result.options[0]);
      expect(result.evidence_id).toMatch(/^transport_\d+_64\.1_-21\.9_64\.2_-21\.8$/);
    });

    it('应该拒绝字符串格式的地址（当前不支持）', async () => {
      await expect(
        skill.execute({
          origin: 'Reykjavik',
          destination: { lat: 64.2, lng: -21.8 },
        }),
      ).rejects.toThrow('transport.search 目前需要坐标格式的 origin 和 destination，字符串格式暂不支持');
    });

    it('应该拒绝字符串格式的目的地（当前不支持）', async () => {
      await expect(
        skill.execute({
          origin: { lat: 64.1, lng: -21.9 },
          destination: 'Akureyri',
        }),
      ).rejects.toThrow('transport.search 目前需要坐标格式的 origin 和 destination，字符串格式暂不支持');
    });

    it('应该在 TransportRoutingService 未注入时抛出错误', async () => {
      const moduleWithoutService: TestingModule =
        await Test.createTestingModule({
          providers: [TransportSearchSkill],
        }).compile();

      const skillWithoutService = moduleWithoutService.get<TransportSearchSkill>(
        TransportSearchSkill,
      );

      await expect(
        skillWithoutService.execute({
          origin: { lat: 64.1, lng: -21.9 },
          destination: { lat: 64.2, lng: -21.8 },
        }),
      ).rejects.toThrow('TransportRoutingService 未注入');
    });

    it('应该处理没有 distanceMeters 的选项', async () => {
      const mockRecommendation = {
        options: [
          {
            mode: 'walk',
            durationMinutes: 60,
            walkDistance: 3000,
          },
        ],
      };

      transportRoutingService.planRoute.mockResolvedValue(
        mockRecommendation as any,
      );

      const result = await skill.execute({
        origin: { lat: 64.1, lng: -21.9 },
        destination: { lat: 64.2, lng: -21.8 },
      });

      expect(result.options[0].distance_meters).toBe(3000); // 使用 walkDistance
    });

    it('应该生成唯一的 evidence_id', async () => {
      const mockRecommendation = {
        options: [
          {
            mode: 'drive',
            durationMinutes: 30,
            walkDistance: 0,
          },
        ],
      };

      transportRoutingService.planRoute.mockResolvedValue(
        mockRecommendation as any,
      );

      const result1 = await skill.execute({
        origin: { lat: 64.1, lng: -21.9 },
        destination: { lat: 64.2, lng: -21.8 },
      });

      const result2 = await skill.execute({
        origin: { lat: 64.1, lng: -21.9 },
        destination: { lat: 64.2, lng: -21.8 },
      });

      expect(result1.evidence_id).not.toBe(result2.evidence_id);
    });
  });
});
