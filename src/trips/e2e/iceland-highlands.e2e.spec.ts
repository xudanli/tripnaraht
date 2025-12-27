// src/trips/e2e/iceland-highlands.e2e.spec.ts
/**
 * Iceland Highlands F-Road Expedition - End-to-End Tests
 * 
 * 冰岛高地 F 路穿越完整链路测试
 * 
 * 测试场景：
 * 1. ✅ 理想夏季高地穿越（正常通过）
 * 2. ✅ 非季节（5 月）高地入口封闭 → Abu 直接否决
 * 3. ✅ 局部 F 路封闭，有可绕行支路 → Neptune 替换成功
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StrategyOrchestratorService } from '../decision/services/strategy-orchestrator.service';
import { AbuStrategy } from '../decision/strategies/abu-strategy.service';
import { DrDreStrategy } from '../decision/strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../decision/strategies/neptune-strategy.service';
import { FatigueCalculatorService } from '../decision/services/fatigue-calculator.service';
import { SpatialReplacementService } from '../decision/services/spatial-replacement.service';
import { SpatialIssueDetectorService } from '../decision/services/spatial-issue-detector.service';
import { RouteDirectionsService } from '../../route-directions/route-directions.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WorldModelContext,
  RoutePlanDraft,
  DecisionParams,
} from '../decision/shared/world-model.types';
import { IS_HIGHLANDS_F_ROAD_EXPEDITION } from '../../route-directions/fixtures/is_highlands_froad.fixture';
import { SpatialIssue } from '../decision/interfaces/spatial-issue.interface';
import { ReplacementOperation } from '../decision/interfaces/replacement-candidate.interface';

describe('Iceland Highlands F-Road Expedition - E2E', () => {
  let orchestrator: StrategyOrchestratorService;
  let spatialIssueDetector: jest.Mocked<SpatialIssueDetectorService>;
  let spatialReplacement: jest.Mocked<SpatialReplacementService>;
  let routeDirectionsService: jest.Mocked<RouteDirectionsService>;

  beforeAll(async () => {
    // 创建 Mock Services
    spatialIssueDetector = {
      detect: jest.fn(),
    } as any;

    spatialReplacement = {
      replaceEntry: jest.fn(),
      replacePoi: jest.fn(),
      replaceSegmentCorridor: jest.fn(),
    } as any;

    routeDirectionsService = {
      findRouteDirectionById: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StrategyOrchestratorService,
        AbuStrategy,
        FatigueCalculatorService,
        DrDreStrategy,
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
          useValue: routeDirectionsService,
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
        NeptuneStrategy,
      ],
    }).compile();

    orchestrator = module.get<StrategyOrchestratorService>(StrategyOrchestratorService);
  });

  describe('场景 1: 理想夏季高地穿越（正常通过）', () => {
    it('should successfully generate a stable plan for Iceland Highlands in August', async () => {
      // 1. 构造 worldModel
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 8,
        decisionParams: {
          maxDailyAscentM: 900,
          rollingAscent3DaysM: 2400,
          maxSlopePct: 25,
          weatherRiskWeight: 0.5,
          bufferDayBias: 'MEDIUM',
          riskTolerance: 'MEDIUM',
        },
        demEvidence: [
          {
            segmentId: 'DAY1_SEG1',
            elevationProfile: [500, 650, 700],
            cumulativeAscentM: 350,
            maxSlopePct: 18,
            rollingFatigueIndex: 0.8,
            violation: 'NONE',
          },
          {
            segmentId: 'DAY2_SEG1',
            elevationProfile: [700, 900, 950],
            cumulativeAscentM: 400,
            maxSlopePct: 22,
            rollingFatigueIndex: 1.0,
            violation: 'NONE',
          },
          {
            segmentId: 'DAY3_SEG1',
            elevationProfile: [650, 700, 680],
            cumulativeAscentM: 200,
            maxSlopePct: 15,
            rollingFatigueIndex: 0.7,
            violation: 'NONE',
          },
        ],
        weatherEvidence: [],
        complianceEvidence: [
          {
            requiresPermit: false,
            requiresGuide: false,
            valid: true,
            violation: 'NONE',
          },
        ],
      };

      // 2. 构造初始 plan draft
      const plan: RoutePlanDraft = {
        tripId: 'TEST_IS_HIGHLANDS_2025_08',
        routeDirectionId: IS_HIGHLANDS_F_ROAD_EXPEDITION.metadata?.testId || IS_HIGHLANDS_F_ROAD_EXPEDITION.name,
        segments: [
          {
            segmentId: 'DAY1_SEG1',
            dayIndex: 1,
            distanceKm: 16,
            ascentM: 350,
            slopePct: 18,
            metadata: {
              fromPoiId: 'landmannalaugar',
              toPoiId: 'camp_site_A',
              mode: 'HIKING',
            },
          },
          {
            segmentId: 'DAY2_SEG1',
            dayIndex: 2,
            distanceKm: 18,
            ascentM: 400,
            slopePct: 22,
            metadata: {
              fromPoiId: 'camp_site_A',
              toPoiId: 'sprengisandur_viewpoint',
              mode: '4X4',
            },
          },
          {
            segmentId: 'DAY3_SEG1',
            dayIndex: 3,
            distanceKm: 14,
            ascentM: 200,
            slopePct: 15,
            metadata: {
              fromPoiId: 'sprengisandur_viewpoint',
              toPoiId: 'south_coast_town',
              mode: '4X4',
            },
          },
        ],
      };

      // Mock: 无空间问题
      spatialIssueDetector.detect.mockResolvedValue([]);
      routeDirectionsService.findRouteDirectionById.mockResolvedValue(
        IS_HIGHLANDS_F_ROAD_EXPEDITION as any,
      );

      // 3. 运行决策引擎
      const result = await orchestrator.run(world, plan);

      // 4. 断言
      expect(result.plan).toBeDefined();
      expect(result.logs).toBeDefined();
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.allowed).toBe(true);

      // Abu 必须 ALLOW 且没有 REJECT 记录
      const abuLogs = result.logs.filter((l) => l.persona === 'ABU');
      expect(abuLogs.some((l) => l.action === 'REJECT')).toBe(false);
      expect(abuLogs.some((l) => l.action === 'ALLOW')).toBe(true);

      // Dr.Dre 可以是 ALLOW 或轻微 ADJUST
      const dreLogs = result.logs.filter((l) => l.persona === 'DR_DRE');
      expect(dreLogs.length).toBeGreaterThan(0);

      // Neptune 在无 issue 时应保持 ALLOW
      const nepLogs = result.logs.filter((l) => l.persona === 'NEPTUNE');
      expect(nepLogs.some((l) => l.action === 'REPLACE')).toBe(false);

      // 整体节奏：天数不减少
      const originalDays = new Set(plan.segments.map((s) => s.dayIndex)).size;
      const newDays = new Set(result.plan!.segments.map((s) => s.dayIndex)).size;
      expect(newDays).toBeGreaterThanOrEqual(originalDays);
    });
  });

  describe('场景 2: 5 月高地入口封闭 → 直接被否决', () => {
    it('should reject Iceland Highlands F-road in May due to seasonal closure', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 5,
        decisionParams: {
          maxDailyAscentM: 900,
          rollingAscent3DaysM: 2400,
          maxSlopePct: 25,
          weatherRiskWeight: 0.5,
          bufferDayBias: 'LOW',
          riskTolerance: 'MEDIUM',
        },
        // 即使 DEM 美好，也不允许走
        demEvidence: [
          {
            segmentId: 'ENTRY_SEG',
            elevationProfile: [600, 700],
            cumulativeAscentM: 150,
            maxSlopePct: 12,
            rollingFatigueIndex: 0.5,
            violation: 'NONE',
          },
        ],
        weatherEvidence: [],
        complianceEvidence: [
          {
            requiresPermit: false,
            requiresGuide: false,
            valid: false, // 季节封闭
            violation: 'HARD',
          },
        ],
      };

      const plan: RoutePlanDraft = {
        tripId: 'TEST_IS_HIGHLANDS_2025_05',
        routeDirectionId: IS_HIGHLANDS_F_ROAD_EXPEDITION.metadata?.testId || IS_HIGHLANDS_F_ROAD_EXPEDITION.name,
        segments: [
          {
            segmentId: 'ENTRY_SEG',
            dayIndex: 1,
            distanceKm: 12,
            ascentM: 150,
            slopePct: 12,
            metadata: {
              fromPoiId: 'ring_road_turnoff',
              toPoiId: 'landmannalaugar',
              mode: '4X4',
            },
          },
        ],
      };

      // Mock: 检测到入口封闭问题
      const entryIssue: SpatialIssue = {
        issueId: 'ENTRY_CLOSED_MAY',
        type: 'ENTRY_UNREACHABLE',
        severity: 'HARD',
        segmentId: 'ENTRY_SEG',
        reason: '5 月高地入口道路季节性封闭，未到开放窗口',
        metadata: { roadId: 'F26', seasonOpenFrom: 6 },
      };
      spatialIssueDetector.detect.mockResolvedValue([entryIssue]);
      spatialReplacement.replaceEntry.mockResolvedValue(null); // 无替代入口

      routeDirectionsService.findRouteDirectionById.mockResolvedValue(
        IS_HIGHLANDS_F_ROAD_EXPEDITION as any,
      );

      const result = await orchestrator.run(world, plan);

      // Abu 必须拒绝
      const abuLogs = result.logs.filter((l) => l.persona === 'ABU');
      expect(abuLogs.some((l) => l.action === 'REJECT')).toBe(true);
      expect(result.plan).toBeNull();
      expect(result.allowed).toBe(false);

      // 可以检查 explanation 文案是否包含季节/封路/不允许等关键词
      const rejectLog = abuLogs.find((l) => l.action === 'REJECT')!;
      expect(rejectLog.explanation).toMatch(/季节|封闭|不允许|合规|HARD/);
    });
  });

  describe('场景 3: 局部 F 路封闭，有绕行 → Neptune 出手', () => {
    it('should reroute around a blocked F-road segment while keeping route direction', async () => {
      const world: WorldModelContext = {
        countryCode: 'IS',
        month: 8,
        decisionParams: {
          maxDailyAscentM: 900,
          rollingAscent3DaysM: 2400,
          maxSlopePct: 28,
          weatherRiskWeight: 0.6,
          bufferDayBias: 'MEDIUM',
          riskTolerance: 'MEDIUM',
        },
        demEvidence: [
          {
            segmentId: 'DAY2_F_SEG_BLOCKED',
            elevationProfile: [700, 900, 950],
            cumulativeAscentM: 400,
            maxSlopePct: 24,
            rollingFatigueIndex: 1.0,
            violation: 'NONE', // 这里风险来自路况，不是 DEM
          },
          {
            segmentId: 'DAY2_ALT_SEG1',
            elevationProfile: [700, 800],
            cumulativeAscentM: 200,
            maxSlopePct: 18,
            rollingFatigueIndex: 0.8,
            violation: 'NONE',
          },
          {
            segmentId: 'DAY2_ALT_SEG2',
            elevationProfile: [800, 900],
            cumulativeAscentM: 200,
            maxSlopePct: 20,
            rollingFatigueIndex: 0.9,
            violation: 'NONE',
          },
        ],
        weatherEvidence: [],
        complianceEvidence: [
          {
            requiresPermit: false,
            requiresGuide: false,
            valid: true,
            violation: 'NONE',
          },
        ],
      };

      const plan: RoutePlanDraft = {
        tripId: 'TEST_IS_HIGHLANDS_2025_08_REROUTE',
        routeDirectionId: IS_HIGHLANDS_F_ROAD_EXPEDITION.metadata?.testId || IS_HIGHLANDS_F_ROAD_EXPEDITION.name,
        segments: [
          {
            segmentId: 'DAY1_SEG1',
            dayIndex: 1,
            distanceKm: 16,
            ascentM: 350,
            slopePct: 18,
            metadata: {
              fromPoiId: 'landmannalaugar',
              toPoiId: 'camp_A',
              mode: 'HIKING',
            },
          },
          {
            segmentId: 'DAY2_F_SEG_BLOCKED',
            dayIndex: 2,
            distanceKm: 22,
            ascentM: 400,
            slopePct: 24,
            metadata: {
              fromPoiId: 'camp_A',
              toPoiId: 'sprengisandur_viewpoint',
              mode: '4X4',
              roadId: 'F26_BLOCKED',
            },
          },
          {
            segmentId: 'DAY3_SEG1',
            dayIndex: 3,
            distanceKm: 14,
            ascentM: 200,
            slopePct: 15,
            metadata: {
              fromPoiId: 'sprengisandur_viewpoint',
              toPoiId: 'south_coast_town',
              mode: '4X4',
            },
          },
        ],
      };

      // Mock: 检测到路段阻塞
      const segmentIssue: SpatialIssue = {
        issueId: 'SEGMENT_BLOCKED_1',
        type: 'SEGMENT_BLOCKED',
        severity: 'HARD',
        segmentId: 'DAY2_F_SEG_BLOCKED',
        reason: 'F26 路段因最近暴雨临时封闭',
        metadata: { roadId: 'F26_BLOCKED', dayIndex: 2 },
      };
      spatialIssueDetector.detect.mockResolvedValue([segmentIssue]);

      // Mock: Neptune 找到绕行方案
      const replacementOp: ReplacementOperation = {
        type: 'SEGMENT_REPLACEMENT',
        originalSegmentId: 'DAY2_F_SEG_BLOCKED',
        newSegmentIds: ['DAY2_ALT_SEG1', 'DAY2_ALT_SEG2'],
        score: 0.8,
        explanation: 'F26 路段因暴雨封闭，已替换为绕行路径（2 段新路段）',
      };
      spatialReplacement.replaceSegmentCorridor.mockResolvedValue(replacementOp);

      routeDirectionsService.findRouteDirectionById.mockResolvedValue(
        IS_HIGHLANDS_F_ROAD_EXPEDITION as any,
      );

      const result = await orchestrator.run(world, plan);

      expect(result.plan).toBeDefined();
      expect(result.allowed).toBe(true);

      const nepLogs = result.logs.filter((l) => l.persona === 'NEPTUNE');
      expect(nepLogs.some((l) => l.action === 'REPLACE')).toBe(true);

      // 替换后的计划中，不应再包含 BLOCKED segment（如果 Neptune 成功替换）
      const segIds = result.plan!.segments.map((s) => s.segmentId);
      
      // 检查 Neptune 是否执行了替换操作
      const hasReplacement = nepLogs.some(
        (l) => l.action === 'REPLACE' && l.reasonCodes.includes('SEGMENT_BLOCKED'),
      );
      
      if (hasReplacement) {
        // 如果 Neptune 执行了替换，应该不包含原 segment
        expect(segIds).not.toContain('DAY2_F_SEG_BLOCKED');
        // 注意：实际的 segment 替换逻辑在 Neptune 策略内部实现
        // 这里主要验证 Neptune 检测到问题并尝试替换
      }

      // RouteDirection 不变
      expect(result.plan!.routeDirectionId).toBe(plan.routeDirectionId);
    });
  });
});

