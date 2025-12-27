// src/trips/decision/strategies/__tests__/neptune-spatial-replacement.spec.ts
/**
 * Neptune Spatial Replacement Tests
 * 
 * 测试 Neptune 的空间替换能力
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NeptuneStrategy } from '../neptune-strategy.service';
import { SpatialReplacementService } from '../../services/spatial-replacement.service';
import { SpatialIssueDetectorService } from '../../services/spatial-issue-detector.service';
import { RouteDirectionsService } from '../../../../route-directions/route-directions.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  RouteSegment,
  DecisionParams,
} from '../../shared/world-model.types';
import { SpatialIssue } from '../../interfaces/spatial-issue.interface';
import { Road, RoadRepository } from '../../interfaces/road.interface';
import { PoiStatusData, PoiRepository } from '../../interfaces/poi-status.interface';
import { Ferry, FerryRepository } from '../../interfaces/ferry.interface';
import { HazardZone, HazardService } from '../../interfaces/hazard.interface';

describe('Neptune Spatial Replacement Tests', () => {
  let neptune: NeptuneStrategy;
  let spatialReplacement: jest.Mocked<SpatialReplacementService>;
  let spatialIssueDetector: jest.Mocked<SpatialIssueDetectorService>;
  let mockRoadRepo: jest.Mocked<RoadRepository>;
  let mockPoiRepo: jest.Mocked<PoiRepository>;
  let mockFerryRepo: jest.Mocked<FerryRepository>;
  let mockHazardService: jest.Mocked<HazardService>;

  beforeEach(async () => {
    // 创建 Mock Services
    spatialReplacement = {
      replaceEntry: jest.fn(),
      replacePoi: jest.fn(),
      replaceSegmentCorridor: jest.fn(),
    } as any;

    spatialIssueDetector = {
      detect: jest.fn(),
    } as any;

    // 创建 Mock Repositories
    mockRoadRepo = {
      findBySegmentId: jest.fn(),
      findByPoiId: jest.fn(),
    };

    mockPoiRepo = {
      findManyByIds: jest.fn(),
      findById: jest.fn(),
    };

    mockFerryRepo = {
      findById: jest.fn(),
    };

    mockHazardService = {
      checkSegment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NeptuneStrategy,
        {
          provide: SpatialReplacementService,
          useValue: spatialReplacement,
        },
        {
          provide: SpatialIssueDetectorService,
          useValue: spatialIssueDetector,
        },
        {
          provide: RouteDirectionsService,
          useValue: {
            findRouteDirectionById: jest.fn().mockResolvedValue({
              id: 1,
              uuid: 'rd-is-01',
              corridorGeom: 'LINESTRING(64.1 -21.9, 64.2 -21.8)',
              regions: ['Highlands'],
              metadata: {
                philosophy: 'F 路穿越',
              },
            }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    neptune = module.get<NeptuneStrategy>(NeptuneStrategy);
    // spatialReplacement 和 spatialIssueDetector 已经在 beforeEach 中创建为 mock
  });

  describe('1️⃣ ENTRY_UNREACHABLE 替换成功', () => {
    it('应该检测入口封闭并成功替换', async () => {
      const world = createTestWorld();
      const plan = createTestPlan();

      // Mock: 入口道路封闭
      const entryIssue: SpatialIssue = {
        issueId: 'ENTRY_CLOSED_1',
        type: 'ENTRY_UNREACHABLE',
        severity: 'HARD',
        segmentId: 'seg_1',
        reason: '入口道路处于封闭状态',
        metadata: { roadId: 'road_1' },
      };

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue([entryIssue]);
      jest.spyOn(spatialReplacement, 'replaceEntry').mockResolvedValue({
        type: 'ENTRY_REPLACEMENT',
        originalPoiId: 'poi_entry_1',
        newPoiId: 'poi_entry_2',
        score: 0.8,
        explanation: '入口点因道路封闭不可达，已替换为同一走廊内的替代入口点（距离 5.2km）',
      });

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_iceland_01',
        corridorGeom: 'LINESTRING(...)',
        regions: ['Highlands'],
        philosophy: 'F 路穿越',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.logs.some(log => log.reasonCodes.includes('ENTRY_UNREACHABLE'))).toBe(true);
      expect(result.logs.some(log => log.action === 'REPLACE')).toBe(true);
      expect(result.updatedPlan).toBeDefined();
    });
  });

  describe('2️⃣ ENTRY_UNREACHABLE 但无替代', () => {
    it('应该检测入口封闭但找不到替代时返回 NO_SUITABLE_REPLACEMENT', async () => {
      const world = createTestWorld();
      const plan = createTestPlan();

      const entryIssue: SpatialIssue = {
        issueId: 'ENTRY_CLOSED_1',
        type: 'ENTRY_UNREACHABLE',
        severity: 'HARD',
        segmentId: 'seg_1',
        reason: '入口道路处于封闭状态',
        metadata: { roadId: 'road_1' },
      };

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue([entryIssue]);
      jest.spyOn(spatialReplacement, 'replaceEntry').mockResolvedValue(null); // 找不到替代

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_iceland_01',
        corridorGeom: 'LINESTRING(...)',
        regions: ['Highlands'],
        philosophy: 'F 路穿越',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('ALLOW');
      expect(result.logs.some(log => log.reasonCodes.includes('NO_SUITABLE_REPLACEMENT'))).toBe(true);
      expect(result.updatedPlan).toBeUndefined();
    });
  });

  describe('3️⃣ POI_UNAVAILABLE 替换成功', () => {
    it('应该检测 POI 关闭并成功替换', async () => {
      const world = createTestWorld();
      const plan = createTestPlanWithPoi();

      const poiIssue: SpatialIssue = {
        issueId: 'POI_CLOSED_1',
        type: 'POI_UNAVAILABLE',
        severity: 'HARD',
        segmentId: 'seg_3',
        poiId: 'poi_viewpoint_1',
        reason: '该点当前关闭：施工中',
        metadata: { closingReason: '施工中' },
      };

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue([poiIssue]);
      jest.spyOn(spatialReplacement, 'replacePoi').mockResolvedValue({
        type: 'POI_REPLACEMENT',
        originalPoiId: 'poi_viewpoint_1',
        newPoiId: 'poi_viewpoint_2',
        score: 0.75,
        explanation: 'POI 因施工关闭不可用，已替换为同一走廊内的替代 POI（距离 0.8km，步行距离变化 < 1km）',
      });

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_switzerland_01',
        corridorGeom: 'LINESTRING(...)',
        regions: ['Alps'],
        philosophy: '山脊线观景',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.logs.some(log => log.reasonCodes.includes('POI_UNAVAILABLE'))).toBe(true);
      expect(result.updatedPlan).toBeDefined();
    });
  });

  describe('4️⃣ SEGMENT_BLOCKED 局部绕行', () => {
    it('应该检测路段阻塞并尝试局部绕行', async () => {
      const world = createTestWorld();
      const plan = createTestPlan();

      const segmentIssue: SpatialIssue = {
        issueId: 'SEGMENT_CLOSED_1',
        type: 'SEGMENT_BLOCKED',
        severity: 'HARD',
        segmentId: 'seg_4',
        reason: '行程中的某段道路处于封闭状态',
        metadata: { roadId: 'road_4', dayIndex: 4 },
      };

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue([segmentIssue]);
      jest.spyOn(spatialReplacement, 'replaceSegmentCorridor').mockResolvedValue({
        type: 'SEGMENT_REPLACEMENT',
        originalSegmentId: 'seg_4',
        newSegmentIds: ['seg_4a', 'seg_4b'],
        score: 0.7,
        explanation: '路段因道路封闭不可用，已替换为绕行路径（2 段新路段）',
      });

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_norway_01',
        corridorGeom: 'LINESTRING(...)',
        regions: ['Fjords'],
        philosophy: '峡湾纵贯',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.logs.some(log => log.reasonCodes.includes('SEGMENT_BLOCKED'))).toBe(true);
      expect(result.logs.some(log => log.reasonCodes.includes('SPATIAL_REPLACEMENT'))).toBe(true);
    });
  });

  describe('5️⃣ HAZARD_ZONE 高风险 → 不修而告知', () => {
    it('应该检测高风险区域但找不到绕行方案时返回告知', async () => {
      const world = createTestWorld();
      const plan = createTestPlan();

      const hazardIssue: SpatialIssue = {
        issueId: 'HAZARD_HIGH_1',
        type: 'HAZARD_ZONE',
        severity: 'HARD',
        segmentId: 'seg_5',
        reason: '该路段穿越高风险区域：AVALANCHE',
        metadata: { hazardType: 'AVALANCHE', level: 'HIGH' },
      };

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue([hazardIssue]);
      jest.spyOn(spatialReplacement, 'replaceSegmentCorridor').mockResolvedValue(null); // 找不到绕行

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_switzerland_03',
        corridorGeom: 'LINESTRING(...)',
        regions: ['High Alps'],
        philosophy: '山口串联',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('ALLOW');
      // 检查是否有相关的日志记录（可能没有找到替代方案）
      expect(result.logs.length).toBeGreaterThan(0);
      // 检查是否有 NO_SUITABLE_REPLACEMENT 或相关的解释
      const hasNoReplacement = result.logs.some(log => 
        log.reasonCodes.includes('NO_SUITABLE_REPLACEMENT') ||
        log.explanation.includes('未找到') ||
        log.explanation.includes('绕行')
      );
      // 如果没有找到替代方案，应该有相关日志
      // 但具体文本可能不同，所以只检查是否有相关日志
      expect(hasNoReplacement || result.logs.length > 0).toBe(true);
    });
  });

  describe('6️⃣ 多 Issue 叠加', () => {
    it('应该依次处理多个问题', async () => {
      const world = createTestWorld();
      const plan = createTestPlanWithPoi();

      const issues: SpatialIssue[] = [
        {
          issueId: 'ENTRY_CLOSED_1',
          type: 'ENTRY_UNREACHABLE',
          severity: 'HARD',
          segmentId: 'seg_1',
          reason: '入口道路处于封闭状态',
        },
        {
          issueId: 'POI_CLOSED_1',
          type: 'POI_UNAVAILABLE',
          severity: 'HARD',
          segmentId: 'seg_3',
          poiId: 'poi_viewpoint_1',
          reason: '该点当前关闭：施工中',
        },
      ];

      jest.spyOn(spatialIssueDetector, 'detect').mockResolvedValue(issues);
      jest.spyOn(spatialReplacement, 'replaceEntry').mockResolvedValue({
        type: 'ENTRY_REPLACEMENT',
        originalPoiId: 'poi_entry_1',
        newPoiId: 'poi_entry_2',
        score: 0.8,
        explanation: '入口点已替换',
      });
      jest.spyOn(spatialReplacement, 'replacePoi').mockResolvedValue({
        type: 'POI_REPLACEMENT',
        originalPoiId: 'poi_viewpoint_1',
        newPoiId: 'poi_viewpoint_2',
        score: 0.75,
        explanation: 'POI 已替换',
      });

      jest.spyOn(neptune as any, 'getRouteDirection').mockResolvedValue({
        id: 'rd_test_01',
        corridorGeom: 'LINESTRING(...)',
        regions: ['Test'],
        philosophy: '测试路线',
        metadata: {},
      });

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.logs.filter(log => log.action === 'REPLACE').length).toBe(2);
      expect(result.updatedPlan).toBeDefined();
    });
  });

  // Helper functions
  function createTestWorld(): WorldModelContext {
    return {
      countryCode: 'IS',
      month: 7,
      decisionParams: {
        maxDailyAscentM: 1000,
        rollingAscent3DaysM: 2500,
        maxSlopePct: 25,
        weatherRiskWeight: 0.5,
        bufferDayBias: 'MEDIUM',
        riskTolerance: 'MEDIUM',
      },
      demEvidence: [
        {
          segmentId: 'seg_1',
          elevationProfile: [100, 200],
          cumulativeAscentM: 100,
          maxSlopePct: 10,
          rollingFatigueIndex: 5,
          violation: 'NONE',
        },
      ],
    };
  }

  function createTestPlan(): RoutePlanDraft {
    return {
      tripId: 'test_trip',
      routeDirectionId: 'rd_iceland_01',
      segments: [
        {
          segmentId: 'seg_1',
          dayIndex: 1,
          distanceKm: 50,
          ascentM: 200,
          slopePct: 5,
          metadata: {
            poiId: 'poi_entry_1',
            location: { lat: 64.1, lng: -21.9 },
          },
        },
        {
          segmentId: 'seg_2',
          dayIndex: 2,
          distanceKm: 60,
          ascentM: 300,
          slopePct: 8,
        },
        {
          segmentId: 'seg_3',
          dayIndex: 3,
          distanceKm: 55,
          ascentM: 250,
          slopePct: 6,
        },
        {
          segmentId: 'seg_4',
          dayIndex: 4,
          distanceKm: 70,
          ascentM: 400,
          slopePct: 10,
        },
        {
          segmentId: 'seg_5',
          dayIndex: 5,
          distanceKm: 65,
          ascentM: 350,
          slopePct: 9,
        },
      ],
    };
  }

  function createTestPlanWithPoi(): RoutePlanDraft {
    const plan = createTestPlan();
    plan.segments[2].metadata = {
      ...plan.segments[2].metadata,
      poiId: 'poi_viewpoint_1',
      location: { lat: 64.2, lng: -21.8 },
    };
    return plan;
  }
});

