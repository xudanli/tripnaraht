// src/skills/places/poi-search.skill.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PoiSearchSkill } from './poi-search.skill';
import { PlacesService } from '../../places/places.service';
import { EntityResolutionService } from '../../places/services/entity-resolution.service';

describe('PoiSearchSkill', () => {
  let skill: PoiSearchSkill;
  let placesService: jest.Mocked<PlacesService>;
  let entityResolutionService: jest.Mocked<EntityResolutionService>;

  beforeEach(async () => {
    const mockPlacesService = {
      search: jest.fn(),
    };

    const mockEntityResolutionService = {
      resolveEntities: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoiSearchSkill,
        {
          provide: PlacesService,
          useValue: mockPlacesService,
        },
        {
          provide: EntityResolutionService,
          useValue: mockEntityResolutionService,
        },
      ],
    }).compile();

    skill = module.get<PoiSearchSkill>(PoiSearchSkill);
    placesService = module.get(PlacesService);
    entityResolutionService = module.get(EntityResolutionService);
  });

  it('应该被定义', () => {
    expect(skill).toBeDefined();
    expect(skill.metadata.name).toBe('poi.search');
    expect(skill.metadata.description).toBe('搜索 POI（地点）');
  });

  describe('execute', () => {
    it('应该优先使用 EntityResolutionService', async () => {
      const mockResults = [
        {
          id: 1,
          name: '测试地点',
          nameCN: '测试地点',
          nameEN: 'Test Place',
          lat: 64.1,
          lng: -21.9,
          category: 'ATTRACTION',
          address: '测试地址',
        },
      ];

      entityResolutionService.resolveEntities.mockResolvedValue({
        results: mockResults,
      } as any);

      const result = await skill.execute({
        query: '测试',
        limit: 10,
        lat: 64.1,
        lng: -21.9,
      });

      expect(entityResolutionService.resolveEntities).toHaveBeenCalledWith(
        '测试',
        [],
        64.1,
        -21.9,
        10,
        undefined,
      );
      expect(result.pois).toHaveLength(1);
      expect(result.pois[0].poi_id).toBe('1');
      expect(result.pois[0].name).toBe('测试地点');
      expect(result.pois[0].coordinates).toEqual({ lat: 64.1, lng: -21.9 });
    });

    it('应该在 EntityResolutionService 失败时降级到 PlacesService', async () => {
      entityResolutionService.resolveEntities.mockRejectedValue(
        new Error('EntityResolutionService 失败'),
      );

      const mockPlaces = [
        {
          id: 2,
          name: '备用地点',
          nameCN: '备用地点',
          geo: { lat: 64.2, lng: -21.8 },
          category: 'RESTAURANT',
          address: '备用地址',
        },
      ];

      placesService.search.mockResolvedValue(mockPlaces as any);

      const result = await skill.execute({
        query: '测试',
        limit: 10,
      });

      expect(entityResolutionService.resolveEntities).toHaveBeenCalled();
      expect(placesService.search).toHaveBeenCalledWith(
        '测试',
        undefined,
        undefined,
        undefined,
        undefined,
        10,
      );
      expect(result.pois).toHaveLength(1);
      expect(result.pois[0].poi_id).toBe('2');
      expect(result.pois[0].name).toBe('备用地点');
    });

    it('应该过滤掉无效坐标（lat/lng 为 0 或 null）', async () => {
      const mockResults = [
        {
          id: 1,
          name: '有效地点',
          lat: 64.1,
          lng: -21.9,
        },
        {
          id: 2,
          name: '无效地点1',
          lat: 0,
          lng: 0,
        },
        {
          id: 3,
          name: '无效地点2',
          lat: null,
          lng: null,
        },
      ];

      entityResolutionService.resolveEntities.mockResolvedValue({
        results: mockResults,
      } as any);

      const result = await skill.execute({
        query: '测试',
      });

      expect(result.pois).toHaveLength(1);
      expect(result.pois[0].name).toBe('有效地点');
    });

    it('应该使用默认 limit 10', async () => {
      entityResolutionService.resolveEntities.mockResolvedValue({
        results: [],
      } as any);

      await skill.execute({
        query: '测试',
      });

      expect(entityResolutionService.resolveEntities).toHaveBeenCalledWith(
        '测试',
        [],
        undefined,
        undefined,
        10,
        undefined,
      );
    });

    it('keyword_only 时向 resolveEntities 传入 keywordOnly 选项', async () => {
      entityResolutionService.resolveEntities.mockResolvedValue({ results: [] } as any);
      await skill.execute({
        query: '冰岛南岸',
        keyword_only: true,
      });
      expect(entityResolutionService.resolveEntities).toHaveBeenCalledWith(
        '冰岛南岸',
        [],
        undefined,
        undefined,
        10,
        { keywordOnly: true },
      );
    });

    it('应该生成唯一的 evidence_id', async () => {
      const mockResults = [
        {
          id: 1,
          name: '测试地点',
          lat: 64.1,
          lng: -21.9,
        },
      ];

      entityResolutionService.resolveEntities.mockResolvedValue({
        results: mockResults,
      } as any);

      const result = await skill.execute({
        query: '测试',
      });

      expect(result.pois[0].evidence_id).toMatch(/^poi_1_\d+$/);
    });

    it('应该在所有服务都失败时返回空数组', async () => {
      entityResolutionService.resolveEntities.mockRejectedValue(
        new Error('EntityResolutionService 失败'),
      );
      placesService.search.mockRejectedValue(new Error('PlacesService 失败'));

      const result = await skill.execute({
        query: '测试',
      });

      expect(result.pois).toHaveLength(0);
    });
  });
});
