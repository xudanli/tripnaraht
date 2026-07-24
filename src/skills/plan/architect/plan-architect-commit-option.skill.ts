// src/skills/plan/architect/plan-architect-commit-option.skill.ts
/**
 * skill.plan.architect.commitOption
 * 
 * 目的：用户选定方案后，写入 PlanState，并产生一个 version
 * 
 * System 1 技能：快速写入和版本管理
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, PlanSkeleton } from '../shared/plan-state.types';

export interface PlanArchitectCommitOptionInput extends SkillInput {
  /** 选定的方案 */
  selectedOption: PlanSkeleton;
  
  /** 现有 PlanState（如果有） */
  existingPlanState?: PlanState;
  
  /** 规划上下文 */
  context: any;
}

export interface PlanArchitectCommitOptionOutput extends SkillOutput {
  /** 更新后的 PlanState */
  planState: PlanState;
  
  /** 版本号 */
  plan_version: number;
  
  /** 变更差异 */
  diff: any;
  
  /** 决策日志引用 */
  decision_log_ref: string;
}

@Injectable()
export class PlanArchitectCommitOptionSkill implements Skill<PlanArchitectCommitOptionInput, PlanArchitectCommitOptionOutput> {
  private readonly logger = new Logger(PlanArchitectCommitOptionSkill.name);

  metadata = {
    name: 'plan.architect.commitOption',
    description: 'plan.architect.commitOption：用户选定方案后，写入 PlanState 并产生版本号',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanArchitectCommitOptionInput): Promise<PlanArchitectCommitOptionOutput> {
    this.logger.debug(`执行 plan.architect.commitOption: optionId=${input.selectedOption.id}`);

    try {
      // 1. 确定版本号
      const plan_version = input.existingPlanState 
        ? input.existingPlanState.plan_version + 1 
        : 1;

      // 2. 生成 Plan ID（如果不存在）
      const plan_id = input.existingPlanState?.plan_id || `plan_${Date.now()}`;

      // 3. 构建新的 PlanState
      const planState: PlanState = {
        plan_id,
        plan_version,
        constraints: input.context.constraints || {},
        itinerary: this.convertSkeletonToItinerary(input.selectedOption, input.context),
        mobility: {
          transferSegments: input.selectedOption.transferDays.map((td, idx) => ({
            id: `transfer_${idx}`,
            from: { city: td.from },
            to: { city: td.to },
            feasibility: 'needs_confirmation' as const,
            riskFlags: [],
            availableModes: td.mode ? [{
              mode: td.mode as any,
              time: 0,
              cost: 0,
              reliability: 'medium' as const,
              effort: 'medium' as const,
            }] : undefined,
          })),
        },
        budget: {},
        pace: {},
        gate: {
          status: 'NEED_CONFIRM',
          reasons: ['方案已选定，待进一步验证'],
          missingEvidence: [],
        },
        evidence_refs: [],
        decision_log_refs: [],
        status: 'PROPOSED',
        metadata: {
          selectedSkeleton: input.selectedOption.id,
          selectedSkeletonName: input.selectedOption.name,
        },
      };

      // 4. 计算 diff
      const diff = this.computeDiff(input.existingPlanState, planState);

      // 5. 生成决策日志引用
      const decision_log_ref = `decision_${Date.now()}`;

      return {
        planState,
        plan_version,
        diff,
        decision_log_ref,
      };
    } catch (error: any) {
      this.logger.error(`提交方案失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  private convertSkeletonToItinerary(skeleton: PlanSkeleton, context: any): any {
    // 将骨架转换为 RoutePlanDraft 格式
    // 这里是一个简化版本，实际应该更详细
    return {
      tripId: context.tripId || `trip_${Date.now()}`,
      days: context.days,
      segments: skeleton.dayThemes.map((theme, idx) => ({
        id: `segment_${idx}`,
        day: theme.day,
        theme: theme.theme,
        description: theme.description,
      })),
    };
  }

  private computeDiff(oldState: PlanState | undefined, newState: PlanState): any {
    if (!oldState) {
      return { type: 'create', newState };
    }

    const diff: any = {
      type: 'update',
      changes: [],
    };

    // 比较关键字段
    if (oldState.status !== newState.status) {
      diff.changes.push({
        field: 'status',
        old: oldState.status,
        new: newState.status,
      });
    }

    if (oldState.metadata?.selectedSkeleton !== newState.metadata?.selectedSkeleton) {
      diff.changes.push({
        field: 'selectedSkeleton',
        old: oldState.metadata?.selectedSkeleton,
        new: newState.metadata?.selectedSkeleton,
      });
    }

    return diff;
  }
}
