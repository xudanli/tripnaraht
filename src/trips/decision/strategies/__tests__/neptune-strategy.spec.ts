// src/trips/decision/strategies/__tests__/neptune-strategy.spec.ts
/**
 * Neptune Strategy Regression Tests
 * 
 * 测试场景：
 * 1. 入口关闭 → 成功换入口 & 日志
 * 2. POI 不可用 → 成功替换 POI
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NeptuneStrategy } from '../neptune-strategy.service';
import { SpatialReplacementService } from '../../services/spatial-replacement.service';
import { SpatialIssueDetectorService } from '../../services/spatial-issue-detector.service';
import { RouteDirectionsService } from '../../../../route-directions/route-directions.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  DecisionParams,
} from '../../shared/world-model.types';
import { SpatialIssue } from '../../interfaces/spatial-issue.interface';
import { ReplacementOperation } from '../../interfaces/replacement-candidate.interface';

describe('Neptune Strategy Regression Tests', () => {
  let neptune: NeptuneStrategy;
  let spatialReplacement: jest.Mocked<SpatialReplacementService>;
  let spatialIssueDetector: jest.Mocked<SpatialIssueDetectorService>;

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
      ],
    }).compile();

    neptune = module.get<NeptuneStrategy>(NeptuneStrategy);
  });

  describe('1. 入口关闭 → 成功换入口 & 日志', () => {
    it('应该检测入口关闭并成功替换', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 1500],
            cumulativeAscentM: 500,
            maxSlopePct: 15,
            rollingFatigueIndex: 20,
            violation: 'NONE',
          },
        ],
      };

      const plan: RoutePlanDraft = {
        tripId: 'test_trip_neptune_entry',
        routeDirectionId: 'rd_is_03',
        segments: [
          {
            segmentId: 'seg_1',
            dayIndex: 1,
            distanceKm: 50,
            ascentM: 500,
            slopePct: 10,
            metadata: {
              poiId: 'poi_entry_1',
              location: { lat: 64.1, lng: -21.9 },
            },
          },
        ],
      };

      // Mock: 检测到入口问题
      const entryIssue: SpatialIssue = {
        issueId: 'ENTRY_CLOSED_1',
        type: 'ENTRY_UNREACHABLE',
        severity: 'HARD',
        segmentId: 'seg_1',
        poiId: 'poi_entry_1',
        reason: '入口道路处于封闭状态',
        originalLocation: { lat: 64.1, lng: -21.9 },
        metadata: { roadId: 'road_1' },
      };

      spatialIssueDetector.detect.mockResolvedValue([entryIssue]);

      // Mock: 成功找到替代入口
      const replacementOp: ReplacementOperation = {
        type: 'ENTRY_REPLACEMENT',
        originalPoiId: 'poi_entry_1',
        newPoiId: 'poi_entry_2',
        score: 0.8,
        explanation: '入口点因道路封闭不可达，已替换为同一走廊内的替代入口点（距离 5.2km）',
      };

      spatialReplacement.replaceEntry.mockResolvedValue(replacementOp);

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.updatedPlan).toBeDefined();
      expect(result.logs.some(log => log.reasonCodes.includes('ENTRY_UNREACHABLE'))).toBe(true);
      expect(result.logs.some(log => log.action === 'REPLACE')).toBe(true);
      expect(result.logs.some(log => log.explanation.includes('入口点'))).toBe(true);

      // 验证调用了替换服务
      expect(spatialReplacement.replaceEntry).toHaveBeenCalled();
    });
  });

  describe('2. POI 不可用 → 成功替换 POI', () => {
    it('应该检测 POI 关闭并成功替换', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_3',
            elevationProfile: [1000, 1500],
            cumulativeAscentM: 500,
            maxSlopePct: 15,
            rollingFatigueIndex: 20,
            violation: 'NONE',
          },
        ],
      };

      const plan: RoutePlanDraft = {
        tripId: 'test_trip_neptune_poi',
        routeDirectionId: 'rd_is_02',
        segments: [
          {
            segmentId: 'seg_1',
            dayIndex: 1,
            distanceKm: 50,
            ascentM: 500,
            slopePct: 10,
          },
          {
            segmentId: 'seg_2',
            dayIndex: 2,
            distanceKm: 60,
            ascentM: 600,
            slopePct: 12,
          },
          {
            segmentId: 'seg_3',
            dayIndex: 3,
            distanceKm: 55,
            ascentM: 550,
            slopePct: 11,
            metadata: {
              poiId: 'poi_viewpoint_1',
              location: { lat: 64.2, lng: -21.8 },
            },
          },
        ],
      };

      // Mock: 检测到 POI 问题
      const poiIssue: SpatialIssue = {
        issueId: 'POI_CLOSED_1',
        type: 'POI_UNAVAILABLE',
        severity: 'HARD',
        segmentId: 'seg_3',
        poiId: 'poi_viewpoint_1',
        reason: '该点当前关闭：施工中',
        originalLocation: { lat: 64.2, lng: -21.8 },
        metadata: { closingReason: '施工中' },
      };

      spatialIssueDetector.detect.mockResolvedValue([poiIssue]);

      // Mock: 成功找到替代 POI
      const replacementOp: ReplacementOperation = {
        type: 'POI_REPLACEMENT',
        originalPoiId: 'poi_viewpoint_1',
        newPoiId: 'poi_viewpoint_2',
        score: 0.75,
        explanation: 'POI 因施工关闭不可用，已替换为同一走廊内的替代 POI（距离 0.8km，步行距离变化 < 1km）',
      };

      spatialReplacement.replacePoi.mockResolvedValue(replacementOp);

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('REPLACE');
      expect(result.updatedPlan).toBeDefined();
      expect(result.logs.some(log => log.reasonCodes.includes('POI_UNAVAILABLE'))).toBe(true);
      expect(result.logs.some(log => log.action === 'REPLACE')).toBe(true);

      // 验证调用了替换服务
      expect(spatialReplacement.replacePoi).toHaveBeenCalled();
    });
  });

  describe('3. 无空间问题 → ALLOW', () => {
    it('应该允许没有空间问题的计划', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 7,
        decisionParams: createDefaultDecisionParams(),
        demEvidence: [
          {
            segmentId: 'seg_1',
            elevationProfile: [1000, 1500],
            cumulativeAscentM: 500,
            maxSlopePct: 15,
            rollingFatigueIndex: 20,
            violation: 'NONE',
          },
        ],
      };

      const plan = createTestPlan();

      spatialIssueDetector.detect.mockResolvedValue([]); // 无问题

      const result = await neptune.evaluate(world, plan);

      expect(result.action).toBe('ALLOW');
      expect(result.logs[0].explanation).toContain('未发现空间层面的阻断或封闭问题');
    });
  });

  // Helper functions
  function createDefaultDecisionParams(): DecisionParams {
    return {
      maxDailyAscentM: 1000,
      rollingAscent3DaysM: 2500,
      maxSlopePct: 25,
      weatherRiskWeight: 0.5,
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    };
  }

  function createTestPlan(): RoutePlanDraft {
    return {
      tripId: 'test_trip_neptune',
      routeDirectionId: 'rd_is_01',
      segments: [
        {
          segmentId: 'seg_1',
          dayIndex: 1,
          distanceKm: 50,
          ascentM: 500,
          slopePct: 10,
        },
      ],
    };
  }
});

