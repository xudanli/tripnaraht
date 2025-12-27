// src/trips/decision/services/persona-explanation.service.ts
/**
 * 人格化解释语言服务
 * 
 * PART B: 对用户可见的"人格化解释语言"
 * 
 * 你不需要暴露算法
 * 你只需要让用户"理解你在替他负责"
 */

import { Injectable } from '@nestjs/common';
import {
  DecisionPersona,
  DecisionAction,
  DecisionDetails,
  PERSONA_LOG_STYLES,
} from '../interfaces/decision-log-enhanced.interface';

@Injectable()
export class PersonaExplanationService {
  /**
   * 生成用户可见的解释
   */
  generateUserExplanation(
    persona: DecisionPersona,
    action: DecisionAction,
    decision: DecisionDetails,
    context?: {
      affectedDays?: number[];
      affectedPeriod?: string;
      originalPlan?: string;
      replacement?: string;
      adjustment?: string;
      reason?: string;
    }
  ): string {
    const style = PERSONA_LOG_STYLES[persona];
    let explanation = style.userExplanationTemplate;

    // 替换占位符
    if (context) {
      if (context.affectedDays) {
        explanation = explanation.replace(
          '{affectedDays}',
          `第 ${context.affectedDays.join('、')} 天`
        );
      }

      if (context.affectedPeriod) {
        explanation = explanation.replace('{affectedPeriod}', context.affectedPeriod);
      }

      if (context.originalPlan) {
        explanation = explanation.replace('{originalPlan}', context.originalPlan);
      }

      if (context.replacement) {
        explanation = explanation.replace('{replacement}', context.replacement);
      }

      if (context.adjustment) {
        explanation = explanation.replace('{adjustment}', context.adjustment);
      }

      if (context.reason) {
        explanation = explanation.replace('{reason}', context.reason);
      }
    }

    // 根据动作类型生成具体解释
    switch (action) {
      case 'REJECT':
        return this.generateRejectionExplanation(persona, decision, context);
      case 'ADJUST':
        return this.generateAdjustmentExplanation(persona, decision, context);
      case 'REPLACE':
        return this.generateReplacementExplanation(persona, decision, context);
      case 'ALLOW':
        return this.generateAllowExplanation(persona, decision);
      default:
        return explanation;
    }
  }

  /**
   * 生成拒绝解释（Abu 风格）
   */
  private generateRejectionExplanation(
    persona: DecisionPersona,
    decision: DecisionDetails,
    context?: any
  ): string {
    if (persona === 'ABU') {
      const reason = this.extractReasonFromCodes(decision.reasonCodes);
      const affectedDays = context?.affectedDays || [];

      if (affectedDays.length > 0) {
        return `我们没有选择这条路线，因为在第 ${affectedDays.join('、')} 天会出现${reason}，这在当前季节和你的节奏偏好下存在明显风险。我们不会赌这件事。`;
      }

      return `我们没有选择这条路线，因为${reason}，这在当前条件下存在明显风险。我们不会赌这件事。`;
    }

    return decision.explanation;
  }

  /**
   * 生成调整解释（Dr.Dre 风格）
   */
  private generateAdjustmentExplanation(
    persona: DecisionPersona,
    decision: DecisionDetails,
    context?: any
  ): string {
    if (persona === 'DR_DRE') {
      const adjustment = context?.adjustment || '关键一天拆开，并插入了一个缓冲日';
      const affectedPeriod = context?.affectedPeriod || '中段';

      return `这条路线是可行的，但原本的节奏会让你在${affectedPeriod}明显疲劳。我们已经帮你把${adjustment}，让体验更稳定。`;
    }

    return decision.explanation;
  }

  /**
   * 生成替换解释（Neptune 风格）
   */
  private generateReplacementExplanation(
    persona: DecisionPersona,
    decision: DecisionDetails,
    context?: any
  ): string {
    if (persona === 'NEPTUNE') {
      const originalPlan = context?.originalPlan || '原计划的入口';
      const replacement = context?.replacement || '一个入口';

      return `路线本身没有问题，只是${originalPlan}在你到达时不可用。我们为你换了一个${replacement}，你走的仍然是同一条路线。`;
    }

    return decision.explanation;
  }

  /**
   * 生成允许解释
   */
  private generateAllowExplanation(
    persona: DecisionPersona,
    decision: DecisionDetails
  ): string {
    return decision.explanation || '路线已通过所有安全检查，可以执行。';
  }

  /**
   * 从原因代码中提取可读原因
   */
  private extractReasonFromCodes(reasonCodes: string[]): string {
    const codeMap: Record<string, string> = {
      'RAPID_ASCENT': '连续高强度爬升',
      'ROLLING_FATIGUE': '连续疲劳累积',
      'WEATHER_RISK': '天气风险',
      'SLOPE_TOO_STEEP': '坡度过于陡峭',
      'ALTITUDE_RISK': '高海拔风险',
      'NO_ACCLIMATIZATION': '缺少适应期',
      'NO_WEATHER_BUFFER': '缺少天气缓冲',
      'NO_DEM_EVIDENCE': '缺少地形证据',
    };

    const reasons = reasonCodes
      .map(code => codeMap[code] || code)
      .filter(Boolean);

    if (reasons.length === 0) {
      return '存在安全风险';
    }

    return reasons.join('、');
  }
}

