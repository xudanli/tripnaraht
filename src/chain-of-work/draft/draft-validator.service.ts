// src/chain-of-work/draft/draft-validator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OrchestrationStep } from '../../agent/interfaces/trip-plan.interface';
import { TripNARAWorkflowDraft, DraftValidationResult } from '../interfaces/chain-of-work.interface';

/**
 * 步骤草案验证器
 */
@Injectable()
export class DraftValidatorService {
  private readonly logger = new Logger(DraftValidatorService.name);

  /**
   * 验证步骤草案
   */
  async validateDraft(draft: TripNARAWorkflowDraft): Promise<DraftValidationResult> {
    this.logger.debug(`[DraftValidator] 开始验证步骤草案: draft_id=${draft.draft_id}`);
    
    const errors: DraftValidationResult['errors'] = [];
    const warnings: DraftValidationResult['warnings'] = [];
    
    // 1. 验证步骤数量（必须包含 8 个状态机步骤）
    const requiredSteps: OrchestrationStep[] = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'];
    const stepTypes = draft.steps.map(s => s.step_type);
    
    for (const requiredStep of requiredSteps) {
      if (!stepTypes.includes(requiredStep)) {
        errors.push({
          step_id: 'draft',
          error_type: 'MISSING_SKILL',
          message: `缺少必需的步骤: ${requiredStep}`,
        });
      }
    }
    
    // 2. 验证步骤顺序（GATE_EVAL 必须在 PLAN_GEN 之前）
    const gateEvalIndex = stepTypes.indexOf('GATE_EVAL');
    const planGenIndex = stepTypes.indexOf('PLAN_GEN');
    
    if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex >= planGenIndex) {
      errors.push({
        step_id: 'draft',
        error_type: 'ORDER_VIOLATION',
        message: 'GATE_EVAL 步骤必须在 PLAN_GEN 步骤之前',
        suggestion: '请调整步骤顺序',
      });
    }
    
    // 3. 验证 RESEARCH 步骤是否有 Skills 映射
    const researchStep = draft.steps.find(s => s.step_type === 'RESEARCH');
    if (researchStep && (!researchStep.skills || researchStep.skills.length === 0)) {
      warnings.push({
        step_id: researchStep.id,
        warning_type: 'MISSING_FALLBACK',
        message: 'RESEARCH 步骤没有映射到任何 Skills',
      });
    }
    
    // 4. 验证 Skills 映射置信度
    for (const step of draft.steps) {
      if (step.skills) {
        for (const skillMapping of step.skills) {
          if (skillMapping.confidence < 0.7) {
            warnings.push({
              step_id: step.id,
              warning_type: 'LOW_CONFIDENCE',
              message: `Skills 映射置信度较低: ${skillMapping.skill_name} (${skillMapping.confidence})`,
            });
          }
        }
      }
    }
    
    const valid = errors.length === 0;
    
    this.logger.debug(`[DraftValidator] 验证完成: valid=${valid}, errors=${errors.length}, warnings=${warnings.length}`);
    
    return {
      valid,
      errors,
      warnings,
    };
  }
}