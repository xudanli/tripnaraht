// src/trips/decision/orchestration/planner-agent.service.ts
/**
 * Planner Agent Service
 * 
 * 职责：意图识别、任务拆解、参数提取
 * 
 * 设计原则：
 * - LangGraph 作为"调度员"而非"驾驶员"
 * - 只负责"听懂人话"，不负责决策
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { IPlannerAgent, LangGraphState } from './langgraph-orchestrator.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';
import { ContextEngineerService } from '../../../agent/context-engine/services/context-engineer.service';
import { buildContextForNode, writeBackFromNode, buildPromptFromContextPackage, mapPhaseToTripTaskPhase } from '../../../agent/context-engine/utils/langgraph-context-integration';

@Injectable()
export class PlannerAgentService implements IPlannerAgent {
  private readonly logger = new Logger(PlannerAgentService.name);
  private readonly useLlm: boolean;

  constructor(
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly contextEngineer?: ContextEngineerService,
  ) {
    // 检查是否启用 LLM（如果 LlmService 可用且配置了 API Key）
    // 检查是否有 LLM 配置（优先 DeepSeek，内网环境可用）
    const hasDeepSeekKey = !!process.env.DEEPSEEK_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
    this.useLlm = !!llmService && (hasDeepSeekKey || hasOpenAIKey);
    if (this.useLlm) {
      this.logger.log('Planner Agent: LLM 已启用');
    } else {
      this.logger.warn('Planner Agent: 使用规则匹配模式（LLM 未启用）');
    }
  }

  /**
   * 分析用户查询（集成 Context Engineer）
   */
  async analyzeQuery(state: LangGraphState): Promise<{
    intent: string;
    extractedParams: LangGraphState['extractedParams'];
    nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
  }> {
    const query = state.userQuery || '';
    this.logger.debug(`分析用户查询: ${query}`);

    // 1. 构建上下文（如果 Context Engineer 可用）
    let contextPackage;
    if (this.contextEngineer) {
      try {
        const ctx = await buildContextForNode(state, this.contextEngineer, {
          agent: 'PLANNER',
          phase: state.planningPhase || 'DRAFTING',
          tokenBudget: 3600,
          requiredTopics: ['VISA', 'ROAD_RULES', 'SAFETY'], // Planner 需要的基础信息
        });
        contextPackage = ctx.contextPackage;
        this.logger.debug(`Context Package 构建完成: ${contextPackage.blocks.length} 个块, ${contextPackage.totalTokens} tokens`);
      } catch (error: any) {
        this.logger.warn(`构建 Context Package 失败: ${error.message}，继续使用原始查询`);
      }
    }

    // 2. 构建增强的 prompt（如果 Context Package 可用）
    let enhancedQuery = query;
    if (contextPackage) {
      const contextPrompt = buildPromptFromContextPackage(contextPackage);
      enhancedQuery = `上下文信息:\n${contextPrompt}\n\n用户查询: ${query}`;
    }

    // 3. 如果 LLM 可用，优先使用 LLM
    if (this.useLlm && this.llmService) {
      try {
        const result = await this.analyzeQueryWithLlm(enhancedQuery);
        
        // 4. 写入回写（如果 Context Engineer 可用）
        if (this.contextEngineer && state.metadata?.tripRunId) {
          try {
            await writeBackFromNode(state, this.contextEngineer, {
              tripRunId: state.metadata.tripRunId as string,
              attemptNumber: (state.metadata.attemptNumber as number) || 1,
              tripId: state.metadata?.tripId as string | undefined,
              phase: mapPhaseToTripTaskPhase(state.planningPhase || 'DRAFTING'),
              scratchpad: {
                planOutline: `Planner 分析完成: intent=${result.intent}, nextStep=${result.nextStep}`,
                nextActions: [result.nextStep],
              },
            });
          } catch (error: any) {
            this.logger.warn(`写入回写失败: ${error.message}`);
          }
        }
        
        return result;
      } catch (error) {
        this.logger.warn(`LLM 分析失败，回退到规则匹配: ${error instanceof Error ? error.message : String(error)}`);
        // 回退到规则匹配
      }
    }

    // 5. 使用规则匹配作为回退或默认方案
    const result = this.analyzeQueryWithRules(query);
    
    // 6. 写入回写（如果 Context Engineer 可用）
    if (this.contextEngineer && state.metadata?.tripRunId) {
      try {
        await writeBackFromNode(state, this.contextEngineer, {
          tripRunId: state.metadata.tripRunId as string,
          attemptNumber: (state.metadata.attemptNumber as number) || 1,
          tripId: state.metadata?.tripId as string | undefined,
          phase: mapPhaseToTripTaskPhase(state.planningPhase || 'DRAFTING'),
          scratchpad: {
            planOutline: `Planner 分析完成（规则匹配）: intent=${result.intent}, nextStep=${result.nextStep}`,
            nextActions: [result.nextStep],
          },
        });
      } catch (error: any) {
        this.logger.warn(`写入回写失败: ${error.message}`);
      }
    }
    
    return result;
  }

  /**
   * 使用 LLM 分析查询（内部方法，接收增强后的 query）
   */
  private async analyzeQueryWithLlm(query: string): Promise<{
    intent: string;
    extractedParams: LangGraphState['extractedParams'];
    nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
  }> {
    const prompt = `你是一个旅行规划助手，负责分析用户查询并提取关键信息。

用户查询：${query}

请分析并返回 JSON 格式：
{
  "intent": "PLAN_TRIP" 或 "RECOMMEND_ROUTE",
  "countryCode": "国家代码（如 IS、NP、CH）",
  "month": 月份数字（1-12），如果未提及则返回 null,
  "routeDirectionKeywords": "路线方向关键词（如 高地、环岛、徒步）",
  "humanCapability": {
    "preferredPace": "SLOW" 或 "MEDIUM" 或 "FAST",
    "riskTolerance": "LOW" 或 "MEDIUM" 或 "HIGH",
    "specialConstraints": ["特殊约束数组，如 膝盖不好、恐高"]
  },
  "nextStep": "CORE_DECISION" 或 "COMPLIANCE_CHECK" 或 "LOCAL_INSIGHT"
}

规则：
- 如果查询涉及签证、许可、permit，nextStep 应为 "COMPLIANCE_CHECK"
- 如果查询涉及当地信息、文化、建议，nextStep 应为 "LOCAL_INSIGHT"
- 其他情况 nextStep 应为 "CORE_DECISION"
- preferredPace: 如果提到"慢"、"轻松"、"不想太累"、"膝盖不好"等，返回 "SLOW"；如果提到"快"、"刺激"等，返回 "FAST"；否则返回 "MEDIUM"
- riskTolerance: 如果提到"低风险"、"安全"等，返回 "LOW"；如果提到"高风险"、"冒险"等，返回 "HIGH"；否则返回 "MEDIUM"
- specialConstraints: 提取所有特殊约束，如"膝盖不好"、"恐高"、"受伤"等

只返回 JSON，不要其他文字。`;

    try {
      // 使用 DeepSeek（内网环境可用）
      const provider = process.env.DEEPSEEK_API_KEY 
        ? LlmProvider.DEEPSEEK 
        : (process.env.OPENAI_API_KEY ? LlmProvider.OPENAI : LlmProvider.DEEPSEEK);
      
      const response = await this.llmService!.callLlmWithSchema(
        provider,
        prompt,
        {
          type: 'object',
          properties: {
            intent: { type: 'string', enum: ['PLAN_TRIP', 'RECOMMEND_ROUTE'] },
            countryCode: { type: 'string' },
            month: { type: ['number', 'null'] },
            routeDirectionKeywords: { type: ['string', 'null'] },
            humanCapability: {
              type: 'object',
              properties: {
                preferredPace: { type: 'string', enum: ['SLOW', 'MEDIUM', 'FAST'] },
                riskTolerance: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
                specialConstraints: { type: 'array', items: { type: 'string' } },
              },
            },
            nextStep: { type: 'string', enum: ['CORE_DECISION', 'COMPLIANCE_CHECK', 'LOCAL_INSIGHT'] },
          },
          required: ['intent', 'countryCode', 'humanCapability', 'nextStep'],
        }
      );

      const parsed = JSON.parse(response);

      return {
        intent: parsed.intent || 'PLAN_TRIP',
        extractedParams: {
          countryCode: parsed.countryCode || undefined,
          month: parsed.month || undefined,
          routeDirectionId: parsed.routeDirectionKeywords || undefined,
          humanCapability: parsed.humanCapability || {},
          specialConstraints: parsed.humanCapability?.specialConstraints || [],
        },
        nextStep: parsed.nextStep || 'CORE_DECISION',
      };
    } catch (error) {
      this.logger.error(`LLM 分析失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * 使用规则匹配分析查询（回退方案）
   */
  private analyzeQueryWithRules(query: string): {
    intent: string;
    extractedParams: LangGraphState['extractedParams'];
    nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
  } {
    // 提取国家代码
    const countryCode = this.extractCountryCode(query);
    
    // 提取月份
    const month = this.extractMonth(query);
    
    // 提取路线方向关键词
    const routeDirectionKeywords = this.extractRouteDirectionKeywords(query);
    
    // 提取用户能力参数
    const humanCapability = this.extractHumanCapability(query);

    // 推断意图
    const intent = this.inferIntent(query);

    // 推断下一步
    const nextStep = this.inferNextStep(query, countryCode);

    return {
      intent,
      extractedParams: {
        countryCode,
        month,
        routeDirectionId: routeDirectionKeywords,
        humanCapability,
        specialConstraints: this.extractSpecialConstraints(query),
      },
      nextStep,
    };
  }

  /**
   * 提取国家代码（简单规则匹配）
   */
  private extractCountryCode(query: string): string | undefined {
    const countryMap: Record<string, string> = {
      '冰岛': 'IS',
      'Iceland': 'IS',
      'IS': 'IS',
      '尼泊尔': 'NP',
      'Nepal': 'NP',
      'NP': 'NP',
      '瑞士': 'CH',
      'Switzerland': 'CH',
      'CH': 'CH',
    };

    for (const [key, code] of Object.entries(countryMap)) {
      if (query.includes(key)) {
        return code;
      }
    }

    return undefined;
  }

  /**
   * 提取月份（简单规则匹配）
   */
  private extractMonth(query: string): number | undefined {
    const monthMap: Record<string, number> = {
      '一月': 1, '1月': 1, 'January': 1, 'Jan': 1,
      '二月': 2, '2月': 2, 'February': 2, 'Feb': 2,
      '三月': 3, '3月': 3, 'March': 3, 'Mar': 3,
      '四月': 4, '4月': 4, 'April': 4, 'Apr': 4,
      '五月': 5, '5月': 5, 'May': 5,
      '六月': 6, '6月': 6, 'June': 6, 'Jun': 6,
      '七月': 7, '7月': 7, 'July': 7, 'Jul': 7,
      '八月': 8, '8月': 8, 'August': 8, 'Aug': 8,
      '九月': 9, '9月': 9, 'September': 9, 'Sep': 9,
      '十月': 10, '10月': 10, 'October': 10, 'Oct': 10,
      '十一月': 11, '11月': 11, 'November': 11, 'Nov': 11,
      '十二月': 12, '12月': 12, 'December': 12, 'Dec': 12,
    };

    for (const [key, month] of Object.entries(monthMap)) {
      if (query.includes(key)) {
        return month;
      }
    }

    // 尝试提取数字月份
    const monthMatch = query.match(/\b([1-9]|1[0-2])\s*月/);
    if (monthMatch) {
      return parseInt(monthMatch[1], 10);
    }

    return undefined;
  }

  /**
   * 提取路线方向关键词
   */
  private extractRouteDirectionKeywords(query: string): string | undefined {
    const keywords = ['高地', 'highlands', '环岛', 'ring road', '徒步', 'hiking', '自驾', 'self-drive'];
    
    for (const keyword of keywords) {
      if (query.toLowerCase().includes(keyword.toLowerCase())) {
        return keyword;
      }
    }

    return undefined;
  }

  /**
   * 提取用户能力参数
   */
  private extractHumanCapability(query: string): Record<string, any> {
    const capability: Record<string, any> = {};

    // 节奏偏好（检查特殊约束，如"膝盖不好"、"不想太累"等）
    const hasSlowIndicators = 
      query.includes('慢') || 
      query.includes('轻松') || 
      query.includes('不想太累') ||
      query.includes('不想累') ||
      query.includes('relaxed') || 
      query.includes('slow') ||
      query.includes('膝盖不好') ||
      query.includes('受伤');

    const hasFastIndicators = 
      query.includes('快') || 
      query.includes('刺激') || 
      query.includes('fast') || 
      query.includes('intense');

    if (hasSlowIndicators) {
      capability.preferredPace = 'SLOW';
    } else if (hasFastIndicators) {
      capability.preferredPace = 'FAST';
    } else {
      capability.preferredPace = 'MEDIUM';
    }

    // 风险承受度
    if (query.includes('低风险') || query.includes('安全') || query.includes('low risk') || query.includes('safe')) {
      capability.riskTolerance = 'LOW';
    } else if (query.includes('高风险') || query.includes('冒险') || query.includes('high risk') || query.includes('adventure')) {
      capability.riskTolerance = 'HIGH';
    } else {
      capability.riskTolerance = 'MEDIUM';
    }

    // 特殊约束
    const specialConstraints: string[] = [];
    if (query.includes('膝盖') || query.includes('knee')) {
      specialConstraints.push('膝盖不好');
    }
    if (query.includes('恐高') || query.includes('acrophobia')) {
      specialConstraints.push('恐高');
    }
    if (specialConstraints.length > 0) {
      capability.specialConstraints = specialConstraints;
    }

    return capability;
  }

  /**
   * 提取特殊约束
   */
  private extractSpecialConstraints(query: string): string[] {
    const constraints: string[] = [];
    
    if (query.includes('膝盖') || query.includes('knee')) {
      constraints.push('膝盖不好');
    }
    if (query.includes('恐高') || query.includes('acrophobia')) {
      constraints.push('恐高');
    }
    if (query.includes('受伤') || query.includes('injury')) {
      constraints.push('受伤');
    }

    return constraints;
  }

  /**
   * 推断意图
   */
  private inferIntent(query: string): string {
    if (query.includes('规划') || query.includes('计划') || query.includes('plan') || query.includes('planning')) {
      return 'PLAN_TRIP';
    }
    if (query.includes('推荐') || query.includes('推荐') || query.includes('recommend')) {
      return 'RECOMMEND_ROUTE';
    }
    return 'PLAN_TRIP'; // 默认
  }

  /**
   * 推断下一步
   */
  private inferNextStep(query: string, _countryCode?: string): 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT' {
    // 如果涉及合规相关关键词，先做合规检查
    if (query.includes('签证') || query.includes('visa') || query.includes('许可') || query.includes('permit')) {
      return 'COMPLIANCE_CHECK';
    }

    // 默认直接进入核心决策
    return 'CORE_DECISION';
  }
}

