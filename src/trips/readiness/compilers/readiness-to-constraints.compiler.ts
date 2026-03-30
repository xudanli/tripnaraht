// src/trips/readiness/compilers/readiness-to-constraints.compiler.ts

/**
 * Readiness to Constraints Compiler
 * 
 * 将 Readiness Findings 编译成决策层可用的约束
 * 输出格式与 ConstraintChecker 兼容
 */

import { Injectable } from '@nestjs/common';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { CheckerViolation } from '../../decision/constraints/constraint-checker';
import { ConstraintViolation } from '../../decision/decision-log';
import { ISODate } from '../../decision/world-model';
import { getLocalizedText } from '../utils/i18n.utils';

export interface ReadinessConstraint {
  id: string;
  type: 'hard' | 'soft';
  severity: 'error' | 'warning' | 'info';
  /**
   * 约束类型，用于区分blocker和must
   * - 'legal_blocker': 法律/法规硬性要求（blocker级别）
   * - 'safety_blocker': 安全硬性要求（blocker级别）
   * - 'strong_recommendation': 强烈建议（must级别）
   * - 'recommendation': 建议（should级别）
   * - 'optional': 可选（optional级别）
   */
  constraintType?: 'legal_blocker' | 'safety_blocker' | 'strong_recommendation' | 'recommendation' | 'optional';
  message: string;
  predicate?: (state: any) => boolean; // 可选的运行时检查函数
  penalty?: (state: any) => number; // 软约束的惩罚函数
  evidence?: Array<{ sourceId: string; sectionId?: string; quote?: string }>;
  tasks?: Array<{ title: string; dueOffsetDays?: number; tags?: string[] }>;
  askUser?: string[];
}

@Injectable()
export class ReadinessToConstraintsCompiler {
  /**
   * 将 Readiness Findings 编译成约束
   */
  compile(result: ReadinessCheckResult): ReadinessConstraint[] {
    const constraints: ReadinessConstraint[] = [];

    for (const finding of result.findings) {
      // Blockers → Hard Constraints (error)
      // 根据category判断是legal_blocker还是safety_blocker
      for (const item of finding.blockers) {
        const constraintType = item.category === 'entry_transit' || item.category === 'health_insurance' 
          ? 'legal_blocker' 
          : 'safety_blocker';
        
        constraints.push({
          id: `readiness.blocker.${item.id}`,
          type: 'hard',
          severity: 'error',
          constraintType,
          message: item.message,
          evidence: item.evidence,
          tasks: item.tasks?.map(task => ({
            title: typeof task.title === 'string' ? task.title : getLocalizedText(task.title),
            dueOffsetDays: task.dueOffsetDays,
            tags: task.tags,
          })),
          askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
            ? item.askUser as string[]
            : (item.askUser as any[])?.map(q => typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (q.text?.zh || q.text?.en || ''))) || [],
        });
      }

      // Must → Hard Constraints (error)
      // 使用strong_recommendation区分blocker
      for (const item of finding.must) {
        constraints.push({
          id: `readiness.must.${item.id}`,
          type: 'hard',
          severity: 'error',
          constraintType: 'strong_recommendation',
          message: item.message,
          evidence: item.evidence,
          tasks: item.tasks?.map(task => ({
            title: typeof task.title === 'string' ? task.title : getLocalizedText(task.title),
            dueOffsetDays: task.dueOffsetDays,
            tags: task.tags,
          })),
          askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
            ? item.askUser as string[]
            : (item.askUser as any[])?.map(q => typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (q.text?.zh || q.text?.en || ''))) || [],
        });
      }

      // Should → Soft Constraints (warning)
      for (const item of finding.should) {
        constraints.push({
          id: `readiness.should.${item.id}`,
          type: 'soft',
          severity: 'warning',
          constraintType: 'recommendation',
          message: item.message,
          evidence: item.evidence,
          tasks: item.tasks?.map(task => ({
            title: typeof task.title === 'string' ? task.title : getLocalizedText(task.title),
            dueOffsetDays: task.dueOffsetDays,
            tags: task.tags,
          })),
          askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
            ? item.askUser as string[]
            : (item.askUser as any[])?.map(q => typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (q.text?.zh || q.text?.en || ''))) || [],
          // 软约束的惩罚函数（可以根据 severity 调整权重）
          penalty: () => item.severity === 'high' ? 0.3 : 0.1,
        });
      }

      // Optional → Soft Constraints (info)
      for (const item of finding.optional) {
        constraints.push({
          id: `readiness.optional.${item.id}`,
          type: 'soft',
          severity: 'info',
          constraintType: 'optional',
          message: item.message,
          evidence: item.evidence,
          tasks: item.tasks?.map(task => ({
            title: typeof task.title === 'string' ? task.title : getLocalizedText(task.title),
            dueOffsetDays: task.dueOffsetDays,
            tags: task.tags,
          })),
        });
      }
    }

    return constraints;
  }

  /**
   * 将 Readiness Findings 转换为 ConstraintViolation（用于 DecisionLog）
   */
  toConstraintViolations(result: ReadinessCheckResult): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    for (const finding of result.findings) {
      // Blockers 和 Must 都视为 violations
      for (const item of [...finding.blockers, ...finding.must]) {
        violations.push({
          code: `READINESS_${item.category.toUpperCase()}_${item.id}`,
          details: {
            destinationId: finding.destinationId,
            category: item.category,
            severity: item.severity,
            message: item.message,
            evidence: item.evidence,
          },
        });
      }
    }

    return violations;
  }

  /**
   * 将 Readiness Findings 转换为 CheckerViolation（用于 ConstraintChecker）
   */
  toCheckerViolations(
    result: ReadinessCheckResult,
    date?: ISODate
  ): CheckerViolation[] {
    const violations: CheckerViolation[] = [];

    for (const finding of result.findings) {
      // Blockers 和 Must → error
      for (const item of [...finding.blockers, ...finding.must]) {
        violations.push({
          code: `READINESS_${item.category.toUpperCase()}`,
          severity: 'error',
          date,
          message: item.message,
          details: {
            destinationId: finding.destinationId,
            category: item.category,
            ruleId: item.id,
            evidence: item.evidence,
          },
          suggestions: item.tasks?.map(t => typeof t.title === 'string' ? t.title : getLocalizedText(t.title)) || [],
        });
      }

      // Should → warning
      for (const item of finding.should) {
        violations.push({
          code: `READINESS_${item.category.toUpperCase()}`,
          severity: 'warning',
          date,
          message: item.message,
          details: {
            destinationId: finding.destinationId,
            category: item.category,
            ruleId: item.id,
          },
          suggestions: item.tasks?.map(t => typeof t.title === 'string' ? t.title : getLocalizedText(t.title)) || [],
        });
      }

      // Optional → info
      for (const item of finding.optional) {
        violations.push({
          code: `READINESS_${item.category.toUpperCase()}`,
          severity: 'info',
          date,
          message: item.message,
          details: {
            destinationId: finding.destinationId,
            category: item.category,
            ruleId: item.id,
          },
        });
      }
    }

    return violations;
  }

  /**
   * 生成准备任务列表（用于 Action Planner）
   */
  extractTasks(result: ReadinessCheckResult): Array<{
    title: string;
    dueOffsetDays: number;
    tags: string[];
    destinationId: string;
    category: string;
  }> {
    const tasks: Array<{
      title: string;
      dueOffsetDays: number;
      tags: string[];
      destinationId: string;
      category: string;
    }> = [];

    for (const finding of result.findings) {
      for (const item of [...finding.blockers, ...finding.must, ...finding.should]) {
        if (item.tasks) {
          for (const task of item.tasks) {
            tasks.push({
              title: typeof task.title === 'string' ? task.title : getLocalizedText(task.title),
              dueOffsetDays: task.dueOffsetDays || 0,
              tags: task.tags || [],
              destinationId: finding.destinationId,
              category: item.category,
            });
          }
        }
      }
    }

    // 按 dueOffsetDays 排序（负数在前，表示提前）
    tasks.sort((a, b) => a.dueOffsetDays - b.dueOffsetDays);

    return tasks;
  }
}

