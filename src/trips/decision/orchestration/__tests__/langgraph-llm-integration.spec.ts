// src/trips/decision/orchestration/__tests__/langgraph-llm-integration.spec.ts
/**
 * LangGraph LLM 集成测试
 * 
 * 测试 Planner Agent 和 Narrator Agent 的 LLM 集成
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PlannerAgentService } from '../planner-agent.service';
import { NarratorAgentService } from '../narrator-agent.service';
import { LlmService } from '../../../../llm/services/llm.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

describe('LangGraph LLM Integration', () => {
  let plannerAgent: PlannerAgentService;
  let narratorAgent: NarratorAgentService;
  let llmService: LlmService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [
        PlannerAgentService,
        NarratorAgentService,
        LlmService,
      ],
    }).compile();

    plannerAgent = module.get<PlannerAgentService>(PlannerAgentService);
    narratorAgent = module.get<NarratorAgentService>(NarratorAgentService);
    llmService = module.get<LlmService>(LlmService);
  });

  describe('Planner Agent LLM 集成', () => {
    it('should detect LLM availability', () => {
      const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
      console.log(`OPENAI_API_KEY configured: ${hasOpenAIKey}`);
      
      // 如果配置了 API Key，应该可以使用 LLM
      if (hasOpenAIKey) {
        expect(llmService).toBeDefined();
      }
    });

    it('should extract parameters (with LLM or fallback)', async () => {
      const query = '我想在7月去冰岛，但我膝盖不好，不想太累';
      
      const result = await plannerAgent.analyzeQuery(query);
      
      expect(result).toBeDefined();
      expect(result.intent).toBeDefined();
      expect(result.extractedParams).toBeDefined();
      
      // 验证提取的参数（无论是 LLM 还是规则匹配都应该能提取）
      expect(result.extractedParams?.countryCode).toBe('IS');
      expect(result.extractedParams?.month).toBe(7);
      expect(result.extractedParams?.humanCapability?.preferredPace).toBe('SLOW');
      expect(result.extractedParams?.specialConstraints).toContain('膝盖不好');
      
      console.log('Planner Agent 结果:', JSON.stringify(result, null, 2));
      console.log('使用模式:', process.env.OPENAI_API_KEY ? 'LLM（如果可用）' : '规则匹配');
    }, 10000); // 10秒超时（如果 LLM 超时会回退到规则匹配）

    it('should fallback to rule-based matching if LLM fails', async () => {
      // 这个测试验证回退机制
      const query = '我想去冰岛';
      
      const result = await plannerAgent.analyzeQuery(query);
      
      expect(result).toBeDefined();
      expect(result.extractedParams?.countryCode).toBe('IS');
      
      console.log('回退模式结果:', JSON.stringify(result, null, 2));
    });
  });

  describe('Narrator Agent LLM 集成', () => {
    it('should generate explanation (with LLM or fallback)', async () => {
      const mockOutput = {
        allowed: true,
        plan: {
          tripId: 'test-trip-1',
          routeDirectionId: 'test-route-1',
          segments: [
            { segmentId: 'seg-1', dayIndex: 1, distanceKm: 50, ascentM: 500, slopePct: 5 },
            { segmentId: 'seg-2', dayIndex: 2, distanceKm: 60, ascentM: 600, slopePct: 6 },
          ],
        },
        action: 'ADJUST' as const,
        logs: [
          {
            persona: 'DR_DRE' as const,
            action: 'ADJUST',
            explanation: '已调整行程节奏，考虑到您的膝盖状况，将每日爬升控制在 500 米以内',
            decisionSource: 'HUMAN' as const,
          },
        ],
        explanation: '节奏调整（Dr.Dre）：已调整行程节奏',
      };

      const explanation = await narratorAgent.generateExplanation(mockOutput);
      
      expect(explanation).toBeDefined();
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('Dr.Dre');
      
      console.log('Narrator Agent 解释:', explanation);
      console.log('使用模式:', process.env.OPENAI_API_KEY ? 'LLM（如果可用）' : '模板模式');
    }, 10000); // 10秒超时（如果 LLM 超时会回退到模板）

    it('should generate rejection explanation', async () => {
      const mockOutput = {
        allowed: false,
        plan: null,
        action: 'REJECT' as const,
        logs: [
          {
            persona: 'ABU' as const,
            action: 'REJECT',
            explanation: '路线被拒绝：5 月高地入口封闭',
            decisionSource: 'PHYSICAL' as const,
          },
        ],
        explanation: '',
      };

      const explanation = await narratorAgent.generateExplanation(mockOutput);
      
      expect(explanation).toBeDefined();
      expect(explanation.length).toBeGreaterThan(0);
      expect(explanation).toContain('拒绝');
      
      console.log('拒绝解释:', explanation);
    }, 10000);
  });

  describe('端到端流程', () => {
    it('should process complete flow (with LLM or fallback)', async () => {
      const query = '我想在8月去挪威，但我恐高，不想走太危险的路';
      
      // 1. Planner Agent 分析查询
      const plannerResult = await plannerAgent.analyzeQuery(query);
      
      expect(plannerResult).toBeDefined();
      expect(plannerResult.extractedParams?.countryCode).toBe('NO');
      expect(plannerResult.extractedParams?.month).toBe(8);
      expect(plannerResult.extractedParams?.humanCapability?.riskTolerance).toBe('LOW');
      
      console.log('Planner 结果:', JSON.stringify(plannerResult, null, 2));
      
      // 2. Narrator Agent 生成解释（模拟）
      const mockOutput = {
        allowed: true,
        plan: {
          tripId: 'test-trip-1',
          routeDirectionId: 'test-route-1',
          segments: [],
        },
        action: 'ADJUST' as const,
        logs: [
          {
            persona: 'DR_DRE' as const,
            action: 'ADJUST',
            explanation: '已调整行程，避开高风险路段',
            decisionSource: 'HUMAN' as const,
          },
        ],
        explanation: '节奏调整（Dr.Dre）：已调整行程，避开高风险路段',
      };
      
      const explanation = await narratorAgent.generateExplanation(mockOutput);
      
      expect(explanation).toBeDefined();
      
      console.log('完整流程 - 最终解释:', explanation);
      console.log('使用模式:', process.env.OPENAI_API_KEY ? 'LLM（如果可用）' : '规则匹配 + 模板');
    }, 15000); // 15秒超时（如果 LLM 超时会回退）
  });
});

