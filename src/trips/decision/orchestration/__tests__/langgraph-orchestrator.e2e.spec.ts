// src/trips/decision/orchestration/__tests__/langgraph-orchestrator.e2e.spec.ts
/**
 * LangGraph Orchestrator E2E Tests
 * 
 * 测试 LangGraph 编排器的端到端流程
 */

import { Test, TestingModule } from '@nestjs/testing';
import { LangGraphOrchestratorService } from '../langgraph-orchestrator.service';
import { PlannerAgentService } from '../planner-agent.service';
import { NarratorAgentService } from '../narrator-agent.service';
import { TripNaraCoreToolService } from '../../tools/tripnara-core-tool.service';
import { StrategyOrchestratorService } from '../../services/strategy-orchestrator.service';
import { RouteDirectionsService } from '../../../../route-directions/route-directions.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { DecisionLogStorageService } from '../../services/decision-log-storage.service';
import { AbuStrategy } from '../../strategies/abu-strategy.service';
import { DrDreStrategy } from '../../strategies/dr-dre-strategy.service';
import { NeptuneStrategy } from '../../strategies/neptune-strategy.service';
import { FatigueCalculatorService } from '../../services/fatigue-calculator.service';
import { DemDecisionEvidencePipelineService } from '../../services/dem-decision-evidence-pipeline.service';
import { SpatialReplacementService } from '../../services/spatial-replacement.service';
import { SpatialIssueDetectorService } from '../../services/spatial-issue-detector.service';

describe('LangGraph Orchestrator E2E', () => {
  let orchestrator: LangGraphOrchestratorService;
  let plannerAgent: PlannerAgentService;
  let narratorAgent: NarratorAgentService;
  let coreTool: TripNaraCoreToolService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LangGraphOrchestratorService,
        PlannerAgentService,
        NarratorAgentService,
        TripNaraCoreToolService,
        StrategyOrchestratorService,
        AbuStrategy,
        DrDreStrategy,
        NeptuneStrategy,
        FatigueCalculatorService,
        {
          provide: RouteDirectionsService,
          useValue: {
            findRouteDirections: jest.fn().mockResolvedValue([
              {
                id: 1,
                uuid: 'test-iceland-highlands',
                name: 'ICELAND_HIGHLANDS',
                nameCN: '冰岛高地',
                countryCode: 'IS',
                tags: ['highlands', 'hiking'],
              },
            ]),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DecisionLogStorageService,
          useValue: {
            saveLogEntries: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DemDecisionEvidencePipelineService,
          useValue: {},
        },
        {
          provide: SpatialReplacementService,
          useValue: {
            replaceEntry: jest.fn(),
            replacePoi: jest.fn(),
            replaceSegmentCorridor: jest.fn(),
          },
        },
        {
          provide: SpatialIssueDetectorService,
          useValue: {
            detect: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    orchestrator = module.get<LangGraphOrchestratorService>(LangGraphOrchestratorService);
    plannerAgent = module.get<PlannerAgentService>(PlannerAgentService);
    narratorAgent = module.get<NarratorAgentService>(NarratorAgentService);
    coreTool = module.get<TripNaraCoreToolService>(TripNaraCoreToolService);
  });

  describe('场景 1: 简单查询 - 冰岛7月', () => {
    it('should process simple query for Iceland in July', async () => {
      const query = '我想在7月去冰岛';

      const result = await orchestrator.execute(query);

      expect(result).toBeDefined();
      expect(result.userQuery).toBe(query);
      expect(result.extractedParams).toBeDefined();
      expect(result.extractedParams?.countryCode).toBe('IS');
      expect(result.extractedParams?.month).toBe(7);
      expect(result.finalResponse).toBeDefined();
    });
  });

  describe('场景 2: 带约束的查询 - 膝盖不好', () => {
    it('should extract special constraints from query', async () => {
      const query = '我想在7月去冰岛，但我膝盖不好，不想太累';

      const result = await orchestrator.execute(query);

      expect(result).toBeDefined();
      expect(result.extractedParams).toBeDefined();
      expect(result.extractedParams?.humanCapability).toBeDefined();
      expect(result.extractedParams?.specialConstraints).toContain('膝盖不好');
      // 膝盖不好应该推断为 SLOW 节奏
      expect(result.extractedParams?.humanCapability?.preferredPace).toBe('SLOW');
    });
  });

  describe('场景 3: Planner Agent 参数提取', () => {
    it('should extract country code correctly', async () => {
      const result = await plannerAgent.analyzeQuery('我想去冰岛');

      expect(result.extractedParams?.countryCode).toBe('IS');
    });

    it('should extract month correctly', async () => {
      const result = await plannerAgent.analyzeQuery('我想在8月去冰岛');

      expect(result.extractedParams?.month).toBe(8);
    });

    it('should extract pace preference', async () => {
      const result = await plannerAgent.analyzeQuery('我想轻松地旅行');

      expect(result.extractedParams?.humanCapability?.preferredPace).toBe('SLOW');
    });
  });

  describe('场景 4: Narrator Agent 解释生成', () => {
    it('should generate rejection explanation', async () => {
      const mockOutput = {
        allowed: false,
        plan: null,
        action: 'REJECT' as const,
        logs: [
          {
            persona: 'ABU' as const,
            action: 'REJECT',
            explanation: '路线被拒绝：季节封路',
            decisionSource: 'PHYSICAL' as const,
          },
        ],
        explanation: '',
      };

      const explanation = await narratorAgent.generateExplanation(mockOutput);

      expect(explanation).toBeDefined();
      expect(explanation).toContain('拒绝');
      expect(explanation).toContain('Abu');
    });

    it('should generate success explanation', async () => {
      const mockOutput = {
        allowed: true,
        plan: {} as any,
        action: 'ADJUST' as const,
        logs: [
          {
            persona: 'DR_DRE' as const,
            action: 'ADJUST',
            explanation: '已调整行程节奏',
            decisionSource: 'HUMAN' as const,
          },
        ],
        explanation: '节奏调整（Dr.Dre）：已调整行程节奏',
      };

      const explanation = await narratorAgent.generateExplanation(mockOutput);

      expect(explanation).toBeDefined();
      expect(explanation).toContain('Dr.Dre');
    });
  });

  describe('场景 5: 完整流程 - 错误处理', () => {
    it('should handle missing parameters gracefully', async () => {
      const query = '我想去旅行'; // 缺少国家、月份等关键信息

      const result = await orchestrator.execute(query);

      expect(result).toBeDefined();
      // 应该返回错误或使用默认值
      expect(result.error || result.finalResponse).toBeDefined();
    });
  });
});

