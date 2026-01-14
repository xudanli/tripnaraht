// src/agent/services/sub-agents/narrator-agent.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { NarratorAgent } from '../../interfaces/sub-agent.interface';
import { Itinerary, GateResult, DecisionLogEntry, OrchestratorState } from '../../interfaces/trip-plan.interface';
import { NarratorAgentService as LangGraphNarratorAgentService } from '../../../trips/decision/orchestration/narrator-agent.service';
import { DecisionExplainForHumanSkill } from '../../../skills/decision/decision-explain-for-human.skill';
import { LlmService } from '../../../llm/services/llm.service';

/**
 * Narrator Agent Service (Claude Orchestration)
 * 
 * 职责：用户可读输出（不得更改硬字段与证据字段）
 */
@Injectable()
export class ClaudeNarratorAgentService implements NarratorAgent {
  private readonly logger = new Logger(ClaudeNarratorAgentService.name);

  constructor(
    @Optional() private readonly langGraphNarrator?: LangGraphNarratorAgentService,
    @Optional() private readonly decisionExplainSkill?: DecisionExplainForHumanSkill,
    @Optional() private readonly llmService?: LlmService,
  ) {
    this.logger.log(`[ClaudeNarratorAgent] 已初始化`);
    this.logger.log(`[ClaudeNarratorAgent] LangGraphNarrator: ${!!this.langGraphNarrator}, DecisionExplainSkill: ${!!this.decisionExplainSkill}, LlmService: ${!!this.llmService}`);
  }

  /**
   * 生成用户可读的解释和故事
   * 
   * 重要：不得修改 itinerary 的硬字段（时间、地点、证据等）
   */
  async narrate(
    itinerary: Itinerary,
    gateResult: GateResult,
    decisionLog: DecisionLogEntry[],
    context: OrchestratorState,
  ): Promise<{
    user_friendly_summary: string;
    day_by_day_narrative: Array<{
      day: number;
      date: string;
      narrative: string;
    }>;
    highlights: string[];
    tips: string[];
    warnings?: string[];
  }> {
    this.logger.debug(`[ClaudeNarratorAgent] 生成叙述: request_id=${itinerary.request_id}`);

    try {
      // 1. 生成总览
      const user_friendly_summary = this.generateSummary(itinerary, gateResult);

      // 2. 生成逐日叙述
      const day_by_day_narrative = itinerary.days.map((day, index) => ({
        day: index + 1,
        date: day.date,
        narrative: this.generateDayNarrative(day, index + 1),
      }));

      // 3. 生成亮点
      const highlights = this.extractHighlights(itinerary);

      // 4. 生成提示
      const tips = this.generateTips(itinerary, gateResult);

      // 5. 生成警告
      const warnings = this.generateWarnings(gateResult, decisionLog);

      return {
        user_friendly_summary,
        day_by_day_narrative,
        highlights,
        tips,
        warnings,
      };
    } catch (error: any) {
      this.logger.error(`[ClaudeNarratorAgent] 生成叙述失败: ${error?.message}`, error?.stack);
      
      // 降级：返回基本叙述
      return {
        user_friendly_summary: `已为您生成 ${itinerary.days.length} 天的行程安排。`,
        day_by_day_narrative: itinerary.days.map((day, index) => ({
          day: index + 1,
          date: day.date,
          narrative: `第 ${index + 1} 天行程，包含 ${day.items.length} 个活动。`,
        })),
        highlights: [],
        tips: ['请以官方信息为准，出行前再次确认'],
        warnings: gateResult.violations.length > 0 ? ['请注意行程中的风险提示'] : undefined,
      };
    }
  }

  /**
   * 生成总览
   */
  private generateSummary(itinerary: Itinerary, gateResult: GateResult): string {
    const parts: string[] = [];

    if (gateResult.gate_result === 'ALLOW') {
      parts.push(`已为您生成 ${itinerary.days.length} 天的行程安排`);
    } else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
      parts.push(`已为您生成 ${itinerary.days.length} 天的行程安排，并根据约束条件进行了调整`);
    } else if (gateResult.gate_result === 'NEED_USER_CONFIRM') {
      parts.push(`已为您生成 ${itinerary.days.length} 天的行程安排，部分内容需要您的确认`);
    }

    const totalItems = itinerary.days.reduce((sum, day) => sum + day.items.length, 0);
    if (totalItems > 0) {
      parts.push(`共包含 ${totalItems} 个活动节点`);
    }

    return parts.join('，') + '。';
  }

  /**
   * 生成单日叙述
   */
  private generateDayNarrative(day: Itinerary['days'][0], dayNumber: number): string {
    const itemCount = day.items.length;
    if (itemCount === 0) {
      return `第 ${dayNumber} 天暂无安排`;
    }

    const itemTypes = day.items.map(item => {
      switch (item.type) {
        case 'POI':
          return item.location_ref.name || '景点';
        case 'TRANSIT':
          return '交通';
        case 'REST':
          return '休息';
        case 'MEAL':
          return '用餐';
        default:
          return item.type;
      }
    });

    return `第 ${dayNumber} 天行程，包含 ${itemCount} 个活动：${itemTypes.slice(0, 3).join('、')}${itemTypes.length > 3 ? '等' : ''}。`;
  }

  /**
   * 提取亮点
   */
  private extractHighlights(itinerary: Itinerary): string[] {
    const highlights: string[] = [];

    // 从 itinerary 中提取亮点（POI 名称等）
    for (const day of itinerary.days) {
      for (const item of day.items) {
        if (item.type === 'POI' && item.location_ref.name) {
          highlights.push(item.location_ref.name);
          if (highlights.length >= 5) break; // 最多 5 个亮点
        }
      }
      if (highlights.length >= 5) break;
    }

    return highlights;
  }

  /**
   * 生成提示
   */
  private generateTips(itinerary: Itinerary, gateResult: GateResult): string[] {
    const tips: string[] = [];

    // 检查是否有未验证的条目
    const hasUnverified = itinerary.days.some(day =>
      day.items.some(item => !item.verified || item.verification_status === 'UNVERIFIED')
    );

    if (hasUnverified) {
      tips.push('部分信息未完全核验，请以官方信息为准');
    }

    if (gateResult.gate_result === 'ADJUST_REQUIRED') {
      tips.push('行程已根据约束条件进行调整，请确认是否符合您的需求');
    }

    tips.push('建议出行前再次确认交通班次、开放时间和票价');
    tips.push('请根据实际天气情况调整行程');

    return tips;
  }

  /**
   * 生成警告
   */
  private generateWarnings(gateResult: GateResult, decisionLog: DecisionLogEntry[]): string[] | undefined {
    const warnings: string[] = [];

    if (gateResult.violations) {
      for (const violation of gateResult.violations) {
        if (violation.severity === 'HARD' || violation.type === 'SAFETY') {
          warnings.push(violation.detail);
        }
      }
    }

    return warnings.length > 0 ? warnings : undefined;
  }
}
