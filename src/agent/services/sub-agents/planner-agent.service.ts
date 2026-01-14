// src/agent/services/sub-agents/planner-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PlannerAgent } from '../../interfaces/sub-agent.interface';
import { TripPlanRequest, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { PlannerAgentService as LangGraphPlannerAgentService } from '../../../trips/decision/orchestration/planner-agent.service';
import { LlmService } from '../../../llm/services/llm.service';
import { LlmProvider } from '../../../llm/dto/llm-request.dto';

/**
 * Planner Agent Service (Claude Orchestration)
 * 
 * 职责：任务拆解、缺口清单、候选方案结构
 * 
 * 适配现有的 LangGraphPlannerAgentService 到新的接口
 */
@Injectable()
export class ClaudePlannerAgentService implements PlannerAgent {
  private readonly logger = new Logger(ClaudePlannerAgentService.name);

  constructor(
    @Optional() private readonly langGraphPlanner?: LangGraphPlannerAgentService,
    @Optional() private readonly llmService?: LlmService,
  ) {
    this.logger.log(`[ClaudePlannerAgent] 已初始化`);
    this.logger.log(`[ClaudePlannerAgent] LangGraphPlanner: ${!!this.langGraphPlanner}, LlmService: ${!!this.llmService}`);
  }

  /**
   * 解析请求并识别缺口
   */
  async analyzeRequest(
    request: TripPlanRequest,
    context: OrchestratorState,
  ): Promise<{
    intent: string;
    gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }>;
    candidate_structure?: {
      suggested_days: number;
      suggested_route?: string[];
      key_pois?: string[];
    };
  }> {
    this.logger.debug(`[PlannerAgent] 分析请求: request_id=${request.request_id}`);

    try {
      // 1. 识别缺口
      const gaps = this.identifyGaps(request);

      // 2. 如果有现有 Planner，使用它进行意图分析
      let intent = 'PLAN_TRIP';
      let candidate_structure;

      if (this.langGraphPlanner) {
        // 将 TripPlanRequest 转换为 LangGraphState 格式（适配）
        const langGraphState = this.convertToLangGraphState(request, context);
        const analysisResult = await this.langGraphPlanner.analyzeQuery(langGraphState);
        intent = analysisResult.intent;
      }

      // 3. 生成候选方案结构（如果有足够信息）
      if (gaps.filter(g => g.severity === 'HARD').length === 0) {
        candidate_structure = this.generateCandidateStructure(request);
      }

      return {
        intent,
        gaps,
        candidate_structure,
      };
    } catch (error: any) {
      this.logger.error(`[PlannerAgent] 分析请求失败: ${error?.message}`, error?.stack);
      throw error;
    }
  }

  /**
   * 识别缺口
   */
  private identifyGaps(request: TripPlanRequest): Array<{
    type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
    severity: 'HARD' | 'SOFT';
    detail: string;
  }> {
    const gaps: Array<{
      type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
      severity: 'HARD' | 'SOFT';
      detail: string;
    }> = [];

    // 检查目的地
    if (!request.destination) {
      gaps.push({
        type: 'MISSING_DESTINATION',
        severity: 'HARD',
        detail: '缺少目的地信息（destination）',
      });
    }

    // 检查日期
    if (!request.date_range && !request.start_date && !request.days) {
      gaps.push({
        type: 'MISSING_DATES',
        severity: 'HARD',
        detail: '缺少日期信息（date_range 或 start_date + days）',
      });
    } else if (request.start_date && !request.days) {
      gaps.push({
        type: 'MISSING_DATES',
        severity: 'SOFT',
        detail: '缺少行程天数（days）',
      });
    }

    // 检查约束（可选，但如果有部分约束则标记为 SOFT）
    if (!request.constraints) {
      gaps.push({
        type: 'MISSING_CONSTRAINTS',
        severity: 'SOFT',
        detail: '缺少约束条件（预算、时间窗、体力要求等）',
      });
    } else {
      // 检查关键约束
      if (request.party && !request.constraints.max_ascent_m && !request.constraints.max_walk_km) {
        gaps.push({
          type: 'MISSING_CONSTRAINTS',
          severity: 'SOFT',
          detail: '缺少体力约束（max_ascent_m、max_walk_km）',
        });
      }
    }

    // 检查偏好（可选）
    if (!request.preferences) {
      gaps.push({
        type: 'MISSING_PREFERENCES',
        severity: 'SOFT',
        detail: '缺少偏好设置（风景优先/效率优先等）',
      });
    }

    return gaps;
  }

  /**
   * 生成候选方案结构
   */
  private generateCandidateStructure(request: TripPlanRequest): {
    suggested_days: number;
    suggested_route?: string[];
    key_pois?: string[];
  } {
    const days = request.days || 
                 (request.date_range 
                   ? Math.ceil(
                       (new Date(request.date_range.end_date).getTime() - 
                        new Date(request.date_range.start_date).getTime()) / 
                       (1000 * 60 * 60 * 24)
                     ) + 1
                   : 5); // 默认 5 天

    return {
      suggested_days: days,
      // suggested_route 和 key_pois 需要后续通过 Skills 获取，这里先留空
    };
  }

  /**
   * 将 TripPlanRequest 转换为 LangGraphState（适配现有接口）
   */
  private convertToLangGraphState(
    request: TripPlanRequest,
    context: OrchestratorState,
  ): any {
    // 构建用户查询字符串
    const queryParts: string[] = [];
    
    if (typeof request.destination === 'string') {
      queryParts.push(`目的地：${request.destination}`);
    } else if (request.destination) {
      queryParts.push(`目的地坐标：${request.destination.lat}, ${request.destination.lng}`);
    }

    if (request.date_range) {
      queryParts.push(`日期：${request.date_range.start_date} 至 ${request.date_range.end_date}`);
    } else if (request.start_date && request.days) {
      queryParts.push(`日期：${request.start_date}，${request.days}天`);
    }

    if (request.party) {
      queryParts.push(`人数：${request.party.count}人`);
      if (request.party.fitness_level) {
        queryParts.push(`体力：${request.party.fitness_level}`);
      }
    }

    if (request.constraints?.budget) {
      queryParts.push(`预算：${request.constraints.budget.total} ${request.constraints.budget.currency || 'CNY'}`);
    }

    const userQuery = queryParts.join('，');

    return {
      userQuery,
      extractedParams: {
        countryCode: typeof request.destination === 'string' ? this.extractCountryCode(request.destination) : undefined,
        month: request.start_date ? new Date(request.start_date).getMonth() + 1 : undefined,
        humanCapability: {
          preferredPace: request.party?.fitness_level === 'low' ? 'SLOW' : 
                        request.party?.fitness_level === 'high' ? 'FAST' : 'MEDIUM',
          riskTolerance: 'MEDIUM', // 默认值
          specialConstraints: [],
        },
      },
      planningPhase: 'DRAFTING',
      metadata: {
        tripRunId: context.request_id,
        attemptNumber: 1,
      },
    };
  }

  /**
   * 从目的地字符串提取国家代码（简单规则）
   */
  private extractCountryCode(destination: string): string | undefined {
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
      '日本': 'JP',
      'Japan': 'JP',
      'JP': 'JP',
    };

    for (const [key, code] of Object.entries(countryMap)) {
      if (destination.includes(key)) {
        return code;
      }
    }

    return undefined;
  }
}
