// src/trips/decision/explainability/explainability.service.ts

/**
 * 可解释性服务 - 人机协同
 * 
 * 将 DecisionLog 的 explanation 和 reasons 转换为前端可用的格式
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionRunLog } from '../decision-log';
import { TripPlan, PlanSlot } from '../plan-model';
import { CheckerViolation } from '../constraints';
import { PlanDiff } from '../plan-diff';

export interface ExplanationItem {
  type: 'reason' | 'warning' | 'suggestion' | 'change';
  title: string;
  message: string;
  details?: Record<string, any>;
  actionable?: boolean;
  actionType?: 'lock' | 'replace' | 'adjust' | 'accept';
}

export interface SlotExplanation {
  slotId: string;
  title: string;
  reasons: string[];
  warnings?: string[];
  suggestions?: string[];
  alternatives?: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
}

export interface PlanExplanation {
  summary: string;
  whyThisPlan: ExplanationItem[];
  whyChanged?: ExplanationItem[];
  violations?: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestions: string[];
  }>;
  slots: SlotExplanation[];
}

@Injectable()
export class ExplainabilityService {
  private readonly logger = new Logger(ExplainabilityService.name);

  /**
   * 生成计划解释
   */
  explainPlan(
    plan: TripPlan,
    log: DecisionRunLog,
    violations?: CheckerViolation[]
  ): PlanExplanation {
    const whyThisPlan: ExplanationItem[] = [];
    const slots: SlotExplanation[] = [];

    // 从决策日志提取原因
    if (log.explanation) {
      whyThisPlan.push({
        type: 'reason',
        title: '规划策略',
        message: log.explanation,
      });
    }

    // 从策略组合提取原因
    if (log.strategyMix && log.strategyMix.length > 0) {
      const strategyNames = {
        abu: '核心体验保护',
        drdre: '时间窗调度',
        neptune: '动态修复',
      };

      whyThisPlan.push({
        type: 'reason',
        title: '使用的策略',
        message: `采用 ${log.strategyMix.map(s => strategyNames[s] || s).join(' + ')} 策略`,
      });
    }

    // 从 chosenActions 提取原因
    for (const action of log.chosenActions || []) {
      whyThisPlan.push({
        type: 'reason',
        title: this.getActionTitle(action.actionType),
        message: this.getActionMessage(action),
        details: action.payload,
        actionable: true,
        actionType: this.mapActionType(action.actionType),
      });
    }

    // 为每个时间槽生成解释
    for (const day of plan.days) {
      for (const slot of day.timeSlots) {
        slots.push(this.explainSlot(slot, day.date));
      }
    }

    // 处理违规
    const violationItems = violations
      ? violations.map(v => ({
          severity: v.severity,
          message: v.message,
          suggestions: v.suggestions || [],
        }))
      : [];

    return {
      summary: this.generateSummary(plan, log, violations),
      whyThisPlan,
      violations: violationItems.length > 0 ? violationItems : undefined,
      slots,
    };
  }

  /**
   * 解释计划变化
   */
  explainChanges(
    oldPlan: TripPlan,
    newPlan: TripPlan,
    diff: PlanDiff,
    log: DecisionRunLog
  ): PlanExplanation {
    const whyChanged: ExplanationItem[] = [];

    // 从 diff 提取变化原因
    if (diff.summary.totalChanged > 0) {
      whyChanged.push({
        type: 'change',
        title: '计划调整',
        message: `共调整了 ${diff.summary.totalChanged} 个活动项`,
        details: {
          moved: diff.summary.moved,
          removed: diff.summary.removed,
          added: diff.summary.added,
          swapped: diff.summary.swapped,
        },
      });
    }

    // 从 violations 提取触发原因
    if (log.violations && log.violations.length > 0) {
      for (const violation of log.violations) {
        whyChanged.push({
          type: 'warning',
          title: '检测到问题',
          message: `原因：${violation.code}`,
          details: violation.details,
          actionable: true,
          actionType: 'adjust',
        });
      }
    }

    // 生成新计划的解释
    const baseExplanation = this.explainPlan(newPlan, log);

    return {
      ...baseExplanation,
      whyChanged,
      summary: `计划已更新：${log.explanation || '根据最新信息调整'}`,
    };
  }

  /**
   * 解释单个时间槽
   */
  private explainSlot(slot: PlanSlot, date: string): SlotExplanation {
    const reasons = slot.reasons || [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // 从 priorityTag 提取原因
    if (slot.priorityTag === 'core') {
      reasons.push('这是核心体验，已优先保留');
    } else if (slot.priorityTag === 'anchor') {
      reasons.push('这是固定锚点，不可调整');
    }

    // 从 locked 提取警告
    if (slot.locked) {
      warnings.push('此活动已锁定，系统不会自动调整');
    }

    // 从 travelLegFromPrev 提取信息
    if (slot.travelLegFromPrev && slot.travelLegFromPrev.durationMin > 0) {
      reasons.push(
        `从上一站到此需要 ${slot.travelLegFromPrev.durationMin} 分钟`
      );
    }

    return {
      slotId: slot.id,
      title: slot.title,
      reasons,
      warnings: warnings.length > 0 ? warnings : undefined,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /**
   * 生成摘要
   */
  private generateSummary(
    plan: TripPlan,
    log: DecisionRunLog,
    violations?: CheckerViolation[]
  ): string {
    const parts: string[] = [];

    parts.push(`为您规划了 ${plan.days.length} 天的行程`);

    const totalSlots = plan.days.reduce(
      (sum, day) => sum + day.timeSlots.length,
      0
    );
    parts.push(`包含 ${totalSlots} 个活动项`);

    if (violations && violations.length > 0) {
      const errorCount = violations.filter(v => v.severity === 'error').length;
      if (errorCount > 0) {
        parts.push(`⚠️ 发现 ${errorCount} 个需要调整的问题`);
      }
    }

    return parts.join('，') + '。';
  }

  private getActionTitle(actionType: string): string {
    const titles: Record<string, string> = {
      prioritize: '优先级调整',
      drop: '活动移除',
      swap: '活动替换',
      reorder: '顺序调整',
      insert_buffer: '缓冲时间',
      shorten: '时长缩短',
    };
    return titles[actionType] || actionType;
  }

  private getActionMessage(action: DecisionRunLog['chosenActions'][0]): string {
    const reasonCodes = action.reasonCodes || [];
    const messages: Record<string, string> = {
      RISK_BASED: '基于风险评估',
      MIN_EDIT_REPAIR: '最小改动修复',
      TIME_WINDOW_MISS: '时间窗冲突',
      BUDGET_OVERRUN: '预算超支',
    };

    return reasonCodes.map(code => messages[code] || code).join('、') || '';
  }

  private mapActionType(
    actionType: string
  ): 'lock' | 'replace' | 'adjust' | 'accept' | undefined {
    switch (actionType) {
      case 'prioritize':
      case 'reorder':
        return 'adjust';
      case 'swap':
      case 'drop':
        return 'replace';
      default:
        return 'accept';
    }
  }
}

