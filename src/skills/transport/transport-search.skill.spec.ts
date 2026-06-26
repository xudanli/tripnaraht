// src/skills/transport/transport-search.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TransportSearchSkill, TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER } from './transport-search.skill';
import { TransportRoutingService } from '../../transport/transport-routing.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';

describe('TransportSearchSkill', () => {
  let skill: TransportSearchSkill;
  let transportRoutingService: jest.Mocked<TransportRoutingService>;

  const mockRoutingOk = {
    options: [
      {
        mode: 'drive',
        durationMinutes: 30,
        walkDistance: 0,
        distanceMeters: 15000,
        steps: [{ instruction: '从起点出发', distance: 5000 }],
      },
    ],
  };

  beforeEach(async () => {
    const mockTransportRoutingService = {
      planPoiHopRoute: jest.fn(),
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

      transportRoutingService.planPoiHopRoute.mockResolvedValue(
        mockRecommendation as any,
      );

      const result = await skill.execute({
        origin: { lat: 64.1, lng: -21.9 },
        destination: { lat: 64.2, lng: -21.8 },
        mode: 'mixed',
      });

      expect(transportRoutingService.planPoiHopRoute).toHaveBeenCalledWith(
        64.1,
        -21.9,
        64.2,
        -21.8,
        'mixed',
      );
      expect(result.options).toHaveLength(2);
      expect(result.options[0].mode).toBe('drive');
      expect(result.options[0].duration_minutes).toBe(30);
      expect(result.best_option).toEqual(result.options[0]);
      expect(result.evidence_id).toMatch(/^transport_\d+_64\.1_-21\.9_64\.2_-21\.8$/);
    });

    it('应该通过冰岛地名锚点解析字符串 origin / destination', async () => {
      transportRoutingService.planPoiHopRoute.mockResolvedValue(mockRoutingOk as any);

      await skill.execute({
        origin: 'Reykjavik',
        destination: 'Akureyri',
      });

      expect(transportRoutingService.planPoiHopRoute).toHaveBeenCalledWith(
        64.1466,
        -21.9426,
        65.6835,
        -18.1262,
        'drive',
      );
    });

    it('应该使用 EntityResolutionService.results 中的坐标解析地名', async () => {
      const resolveEntities = jest.fn().mockResolvedValue({
        results: [
          {
            id: 1,
            name: '杭州西湖',
            nameCN: '杭州西湖',
            category: 'SCENIC',
            lat: 30.2427,
            lng: 120.1487,
            score: 0.9,
            source: 'vector_search' as const,
            matchReasons: [],
          },
        ],
        missingPois: [],
        needsClarification: [],
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TransportSearchSkill,
          { provide: TransportRoutingService, useValue: { planPoiHopRoute: jest.fn() } },
          { provide: EntityResolutionService, useValue: { resolveEntities } },
        ],
      }).compile();

      const s = module.get<TransportSearchSkill>(TransportSearchSkill);
      const routing = module.get(TransportRoutingService) as jest.Mocked<TransportRoutingService>;
      routing.planPoiHopRoute.mockResolvedValue(mockRoutingOk as any);

      await s.execute({
        origin: '杭州西湖风景区',
        destination: { lat: 30.25, lng: 120.15 },
      });

      expect(resolveEntities).toHaveBeenCalled();
      expect(routing.planPoiHopRoute).toHaveBeenCalledWith(
        30.2427,
        120.1487,
        30.25,
        120.15,
        'drive',
      );
    });

    it('应该在两端都无法解析为坐标时抛出明确错误', async () => {
      const resolveEntities = jest.fn().mockResolvedValue({
        results: [],
        missingPois: [],
        needsClarification: [],
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TransportSearchSkill,
          { provide: TransportRoutingService, useValue: { planPoiHopRoute: jest.fn() } },
          { provide: EntityResolutionService, useValue: { resolveEntities } },
        ],
      }).compile();

      const s = module.get<TransportSearchSkill>(TransportSearchSkill);

      await expect(
        s.execute({
          origin: '__no_such_place_xyz__',
          destination: '__another_unknown__',
        }),
      ).rejects.toThrow(TRANSPORT_SEARCH_UNRESOLVED_COORDS_MARKER);
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

      transportRoutingService.planPoiHopRoute.mockResolvedValue(
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

      transportRoutingService.planPoiHopRoute.mockResolvedValue(
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
