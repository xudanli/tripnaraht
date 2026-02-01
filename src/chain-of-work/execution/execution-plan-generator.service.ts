// src/chain-of-work/execution/execution-plan-generator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripNARAWorkflowDraft, ExecutionPlan } from '../interfaces/chain-of-work.interface';

/**
 * 执行计划生成器
 */
@Injectable()
export class ExecutionPlanGeneratorService {
  private readonly logger = new Logger(ExecutionPlanGeneratorService.name);

  /**
   * 生成执行计划
   */
  async generatePlan(draft: TripNARAWorkflowDraft): Promise<ExecutionPlan> {
    this.logger.log(`[ExecutionPlanGenerator] 开始生成执行计划: draft_id=${draft.draft_id}`);
    
    const steps = draft.steps.map(step => ({
      id: step.id,
      step_type: step.step_type,
      sub_agent: step.sub_agent,
      skills: step.skills?.map(s => s.skill_name) || [],
      input_mapping: {},
      output_schema: {},
      dependencies: this.calculateDependencies(step, draft.steps),
      fallback_strategy: {
        on_error: 'continue' as const,
        retry_count: 1,
      },
    }));
    
    // 识别可并行执行的步骤组
    const parallelGroups = this.identifyParallelGroups(steps);
    
    return {
      draft_id: draft.draft_id,
      workflow_id: draft.workflow_id,
      version: draft.version,
      steps,
      parallel_groups: parallelGroups,
    };
  }

  /**
   * 计算步骤依赖关系
   */
  private calculateDependencies(step: any, allSteps: any[]): string[] {
    const stepOrder: Record<string, number> = {
      'INTAKE': 1,
      'RESEARCH': 2,
      'GATE_EVAL': 3,
      'PLAN_GEN': 4,
      'VERIFY': 5,
      'REPAIR': 6,
      'NARRATE': 7,
      'DONE': 8,
    };
    
    const currentOrder = stepOrder[step.step_type] || 99;
    const dependencies: string[] = [];
    
    for (const otherStep of allSteps) {
      const otherOrder = stepOrder[otherStep.step_type] || 99;
      if (otherOrder < currentOrder) {
        dependencies.push(otherStep.id);
      }
    }
    
    return dependencies;
  }

  /**
   * 识别可并行执行的步骤组
   */
  private identifyParallelGroups(steps: ExecutionPlan['steps']): string[][] {
    // RESEARCH 步骤中的多个 Skills 可以并行执行
    const researchSteps = steps.filter(s => s.step_type === 'RESEARCH');
    if (researchSteps.length > 0) {
      return [researchSteps.map(s => s.id)];
    }
    
    return [];
  }
}