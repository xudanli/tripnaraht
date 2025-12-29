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
import { TripNaraCoreToolInput } from '../tools/tripnara-core-tool.interface';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

@Injectable()
export class PlannerAgentService implements IPlannerAgent {
  private readonly logger = new Logger(PlannerAgentService.name);
  private readonly useLlm: boolean;

  constructor(
    @Optional() private readonly llmService?: LlmService,
  ) {
    // 检查是否启用 LLM（如果 LlmService 可用且配置了 API Key）
    this.useLlm = !!llmService && !!process.env.OPENAI_API_KEY;
    if (this.useLlm) {
      this.logger.log('Planner Agent: LLM 已启用');
    } else {
      this.logger.warn('Planner Agent: 使用规则匹配模式（LLM 未启用）');
    }
  }

  /**
   * 分析用户查询
   */
  async analyzeQuery(query: string): Promise<{
    intent: string;
    extractedParams: LangGraphState['extractedParams'];
    nextStep: 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT';
  }> {
    this.logger.debug(`分析用户查询: ${query}`);

    // 如果 LLM 可用，优先使用 LLM
    if (this.useLlm && this.llmService) {
      try {
        return await this.analyzeQueryWithLlm(query);
      } catch (error) {
        this.logger.warn(`LLM 分析失败，回退到规则匹配: ${error instanceof Error ? error.message : String(error)}`);
        // 回退到规则匹配
      }
    }

    // 使用规则匹配作为回退或默认方案
    return this.analyzeQueryWithRules(query);
  }

  /**
   * 使用 LLM 分析查询
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
      const response = await this.llmService!.callLlmWithSchema(
        LlmProvider.OPENAI,
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
  private inferNextStep(query: string, countryCode?: string): 'CORE_DECISION' | 'COMPLIANCE_CHECK' | 'LOCAL_INSIGHT' {
    // 如果涉及合规相关关键词，先做合规检查
    if (query.includes('签证') || query.includes('visa') || query.includes('许可') || query.includes('permit')) {
      return 'COMPLIANCE_CHECK';
    }

    // 默认直接进入核心决策
    return 'CORE_DECISION';
  }
}

