// src/skills/plan/constraints/plan-constraints-detect-conflicts.skill.ts
/**
 * skill.plan.constraints.detectConflicts
 * 
 * 目的：检测约束冲突（预算不足、时间不够、节奏过载、不可达）
 * 
 * System 1 技能：快速检测
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { PlanState, ConflictDetection } from '../shared/plan-state.types';

export interface PlanConstraintsDetectConflictsInput extends SkillInput {
  /** PlanState */
  planState: PlanState;
}

export interface PlanConstraintsDetectConflictsOutput extends SkillOutput {
  /** 冲突检测结果 */
  conflicts: ConflictDetection;
}

@Injectable()
export class PlanConstraintsDetectConflictsSkill implements Skill<PlanConstraintsDetectConflictsInput, PlanConstraintsDetectConflictsOutput> {
  private readonly logger = new Logger(PlanConstraintsDetectConflictsSkill.name);

  metadata = {
    name: 'plan.constraints.detectConflicts',
    description: 'plan.constraints.detectConflicts：检测 plan 约束冲突（预算/时间/节奏/可达性）。在 architect 产出方案后或用户修改约束需 gate 前扫描时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanConstraintsDetectConflictsInput): Promise<PlanConstraintsDetectConflictsOutput> {
    this.logger.debug(`执行 plan.constraints.detectConflicts: planId=${input.planState.plan_id}`);

    try {
      const conflicts: ConflictDetection['conflicts'] = [];

      // 1. 检测预算冲突
      if (input.planState.budget.overrun && input.planState.budget.overrun.overrunAmount > 0) {
        const severity = input.planState.budget.overrun.overrunAmount > input.planState.constraints.budget?.total! * 0.2 
          ? 'critical' 
          : input.planState.budget.overrun.overrunAmount > input.planState.constraints.budget?.total! * 0.1
          ? 'high'
          : 'medium';
        
        conflicts.push({
          type: 'budget',
          severity,
          description: `预算超支 ${input.planState.budget.overrun.overrunAmount} ${input.planState.constraints.budget?.currency || 'CNY'}`,
          affectedDays: undefined,
          affectedSegments: undefined,
        });
      }

      // 2. 检测时间冲突
      const timeWindows = input.planState.pace.timeWindows || [];
      const insufficientTime = timeWindows.filter(tw => {
        const start = parseInt(tw.start.split(':')[0]);
        const end = parseInt(tw.end.split(':')[0]);
        return (end - start) < 6; // 少于 6 小时可用时间
      });
      
      if (insufficientTime.length > 0) {
        conflicts.push({
          type: 'time',
          severity: insufficientTime.length > timeWindows.length / 2 ? 'high' : 'medium',
          description: `${insufficientTime.length} 天可用时间不足`,
          affectedDays: insufficientTime.map(tw => tw.day),
          affectedSegments: undefined,
        });
      }

      // 3. 检测节奏过载
      if (input.planState.pace.fatigueScore && input.planState.pace.fatigueScore.paceScore > 70) {
        conflicts.push({
          type: 'pace',
          severity: input.planState.pace.fatigueScore.paceScore > 85 ? 'high' : 'medium',
          description: `疲劳评分过高: ${input.planState.pace.fatigueScore.paceScore}/100`,
          affectedDays: input.planState.pace.fatigueScore.fatigueDrivers.map(() => 0), // 简化
          affectedSegments: undefined,
        });
      }

      // 4. 检测不可达
      const infeasibleSegments = input.planState.mobility.transferSegments.filter(
        seg => seg.feasibility === 'infeasible'
      );
      
      if (infeasibleSegments.length > 0) {
        conflicts.push({
          type: 'feasibility',
          severity: 'critical',
          description: `${infeasibleSegments.length} 段不可达`,
          affectedDays: undefined,
          affectedSegments: infeasibleSegments.map(seg => seg.id),
        });
      }

      return {
        conflicts: {
          conflicts,
        },
      };
    } catch (error: any) {
      this.logger.error(`检测冲突失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}
