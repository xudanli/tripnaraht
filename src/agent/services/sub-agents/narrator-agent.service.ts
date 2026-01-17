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
   * 🆕 生成简化版本的决策日志（减少认知负荷）
   */
  generateSimplifiedDecisionLog(
    decisionLog: DecisionLogEntry[],
    gateResult: GateResult,
  ): {
    summary: string;
    key_decisions: Array<{
      step: string;
      decision: string;
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    evidence_count: number;
    has_details: boolean;
  } {
    // 提取关键决策点
    const keyDecisions: Array<{
      step: string;
      decision: string;
      impact: 'HIGH' | 'MEDIUM' | 'LOW';
    }> = [];

    // 1. Gate评估结果（最重要）
    if (gateResult) {
      keyDecisions.push({
        step: 'GATE_EVAL',
        decision: this.translateGateResult(gateResult.gate_result),
        impact: 'HIGH',
      });
    }

    // 2. 提取其他关键决策（只保留高影响决策）
    for (const entry of decisionLog) {
      if (this.isKeyDecision(entry)) {
        keyDecisions.push({
          step: entry.step,
          decision: this.simplifyDecisionMessage(entry),
          impact: this.assessDecisionImpact(entry),
        });
      }
    }

    // 只保留高影响和中影响的决策
    const filteredDecisions = keyDecisions.filter(
      d => d.impact === 'HIGH' || d.impact === 'MEDIUM'
    );

    // 生成摘要
    const summary = this.generateDecisionSummary(gateResult, filteredDecisions);

    return {
      summary,
      key_decisions: filteredDecisions.slice(0, 5), // 最多5个关键决策
      evidence_count: decisionLog.reduce(
        (sum, entry) => sum + (entry.evidence_refs?.length || 0),
        0
      ),
      has_details: true, // 详细版本总是可用
    };
  }

  /**
   * 🆕 判断是否为关键决策
   */
  private isKeyDecision(entry: DecisionLogEntry): boolean {
    // 关键步骤：GATE_EVAL, PLAN_GEN, VERIFY, REPAIR
    const keySteps = ['GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR'];
    return keySteps.includes(entry.step);
  }

  /**
   * 🆕 简化决策消息（去除技术术语）
   */
  private simplifyDecisionMessage(entry: DecisionLogEntry): string {
    // 将技术术语转换为用户友好的语言
    let message = entry.outputs_summary || entry.inputs_summary || '';

    // 替换技术术语
    message = message.replace(/GATE_EVAL/g, '可行性评估');
    message = message.replace(/PLAN_GEN/g, '行程生成');
    message = message.replace(/VERIFY/g, '验证');
    message = message.replace(/REPAIR/g, '修复');
    message = message.replace(/INTAKE/g, '需求解析');
    message = message.replace(/RESEARCH/g, '数据收集');
    message = message.replace(/NARRATE/g, '说明生成');

    // 简化消息长度
    if (message.length > 100) {
      message = message.substring(0, 97) + '...';
    }

    return message;
  }

  /**
   * 🆕 评估决策影响
   */
  private assessDecisionImpact(entry: DecisionLogEntry): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 根据步骤和内容评估影响
    if (entry.step === 'GATE_EVAL') {
      return 'HIGH';
    }
    if (entry.step === 'PLAN_GEN' || entry.step === 'REPAIR') {
      return 'HIGH';
    }
    if (entry.step === 'VERIFY') {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  /**
   * 🆕 生成决策摘要
   */
  private generateDecisionSummary(
    gateResult: GateResult,
    keyDecisions: Array<{ step: string; decision: string; impact: string }>
  ): string {
    const parts: string[] = [];

    // Gate评估结果
    if (gateResult) {
      parts.push(`行程${this.translateGateResult(gateResult.gate_result)}`);
    }

    // 关键决策数量
    if (keyDecisions.length > 0) {
      parts.push(`进行了${keyDecisions.length}项关键检查`);
    }

    return parts.join('，') + '。';
  }

  /**
   * 🆕 翻译Gate结果
   */
  private translateGateResult(status: string): string {
    const translations: Record<string, string> = {
      'ALLOW': '已通过',
      'BLOCK': '被拒绝',
      'ADJUST_REQUIRED': '需要调整',
      'NEED_USER_CONFIRM': '需要您确认',
    };
    return translations[status] || status;
  }

  /**
   * 生成总览（优化版：使用用户语言）
   */
  private generateSummary(itinerary: Itinerary, gateResult: GateResult): string {
    const parts: string[] = [];

    // 使用用户友好的语言
    if (gateResult.gate_result === 'ALLOW') {
      parts.push(`为您规划了${itinerary.days.length}天的行程`);
      parts.push('行程已通过安全检查');
    } else if (gateResult.gate_result === 'ADJUST_REQUIRED') {
      parts.push(`为您规划了${itinerary.days.length}天的行程`);
      parts.push('行程需要一些调整');
    } else if (gateResult.gate_result === 'NEED_USER_CONFIRM') {
      parts.push(`为您规划了${itinerary.days.length}天的行程`);
      parts.push('部分内容需要您的确认');
    } else if (gateResult.gate_result === 'BLOCK') {
      parts.push(`行程存在安全风险，建议修改`);
    }

    const totalItems = itinerary.days.reduce((sum, day) => sum + day.items.length, 0);
    if (totalItems > 0) {
      parts.push(`包含${totalItems}个精选地点`);
    }

    return parts.join('，') + '。';
  }

  /**
   * 生成单日叙述（优化版：使用更自然的语言）
   */
  private generateDayNarrative(day: Itinerary['days'][0], dayNumber: number): string {
    const itemCount = day.items.length;
    if (itemCount === 0) {
      return `第 ${dayNumber} 天暂无安排，您可以自由探索或休息。`;
    }

    // 提取主要活动类型
    const poiItems = day.items.filter(item => item.type === 'POI');
    const transitItems = day.items.filter(item => item.type === 'TRANSIT');
    const mealItems = day.items.filter(item => item.type === 'MEAL');

    const parts: string[] = [];
    
    // 描述主要景点
    if (poiItems.length > 0) {
      const poiNames = poiItems
        .slice(0, 3)
        .map(item => item.location_ref.name)
        .filter(Boolean);
      if (poiNames.length > 0) {
        parts.push(`将游览${poiNames.join('、')}${poiItems.length > 3 ? '等' : ''}`);
      }
    }

    // 描述交通安排
    if (transitItems.length > 0) {
      parts.push(`包含${transitItems.length}段交通安排`);
    }

    // 描述用餐安排
    if (mealItems.length > 0) {
      parts.push(`安排了${mealItems.length}次用餐`);
    }

    return parts.length > 0 
      ? `第 ${dayNumber} 天：${parts.join('，')}。`
      : `第 ${dayNumber} 天行程，包含 ${itemCount} 个活动。`;
  }

  /**
   * 提取亮点（优化版：添加描述性语言）
   */
  private extractHighlights(itinerary: Itinerary): string[] {
    const highlights: string[] = [];

    // 从 itinerary 中提取亮点（POI 名称等）
    for (const day of itinerary.days) {
      for (const item of day.items) {
        if (item.type === 'POI' && item.location_ref.name) {
          // 添加描述性前缀，使亮点更吸引人
          const poiName = item.location_ref.name;
          highlights.push(poiName);
          if (highlights.length >= 5) break; // 最多 5 个亮点
        }
      }
      if (highlights.length >= 5) break;
    }

    return highlights;
  }

  /**
   * 生成提示（优化版：使用更友好的语言）
   */
  private generateTips(itinerary: Itinerary, gateResult: GateResult): string[] {
    const tips: string[] = [];

    // 检查是否有未验证的条目
    const hasUnverified = itinerary.days.some(day =>
      day.items.some(item => !item.verified || item.verification_status === 'UNVERIFIED')
    );

    if (hasUnverified) {
      tips.push('部分信息可能尚未完全核验，建议您出行前以官方信息为准');
    }

    if (gateResult.gate_result === 'ADJUST_REQUIRED') {
      tips.push('行程已根据您的需求进行了优化调整，请查看是否符合您的期望');
    }

    tips.push('出行前建议再次确认交通班次、开放时间和票价，避免临时变更');
    tips.push('请关注天气预报，根据实际情况灵活调整行程安排');

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
