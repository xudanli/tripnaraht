// src/chain-of-work/draft/draft-editor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripNARAWorkflowDraft, TripNARAStepDraft } from '../interfaces/chain-of-work.interface';

/**
 * 步骤草案编辑器
 */
@Injectable()
export class DraftEditorService {
  private readonly logger = new Logger(DraftEditorService.name);

  /**
   * 编辑步骤
   */
  async updateStep(
    draft: TripNARAWorkflowDraft,
    stepId: string,
    updates: Partial<TripNARAStepDraft>,
  ): Promise<TripNARAWorkflowDraft> {
    this.logger.debug(`[DraftEditor] 编辑步骤: draft_id=${draft.draft_id}, step_id=${stepId}`);
    
    const stepIndex = draft.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`步骤不存在: ${stepId}`);
    }
    
    // 更新步骤
    draft.steps[stepIndex] = {
      ...draft.steps[stepIndex],
      ...updates,
      status: 'modified',
      updated_at: new Date().toISOString(),
      version: draft.steps[stepIndex].version + 1,
    };
    
    // 更新草案元数据
    draft.updated_at = new Date().toISOString();
    draft.metadata.last_modified = new Date().toISOString();
    
    return draft;
  }

  /**
   * 添加步骤
   */
  async addStep(
    draft: TripNARAWorkflowDraft,
    step: TripNARAStepDraft,
    position?: number,
  ): Promise<TripNARAWorkflowDraft> {
    this.logger.debug(`[DraftEditor] 添加步骤: draft_id=${draft.draft_id}, position=${position}`);
    
    if (position !== undefined) {
      draft.steps.splice(position, 0, step);
    } else {
      draft.steps.push(step);
    }
    
    // 更新草案元数据
    draft.metadata.step_count = draft.steps.length;
    draft.updated_at = new Date().toISOString();
    draft.metadata.last_modified = new Date().toISOString();
    
    return draft;
  }

  /**
   * 删除步骤
   */
  async deleteStep(
    draft: TripNARAWorkflowDraft,
    stepId: string,
  ): Promise<TripNARAWorkflowDraft> {
    this.logger.debug(`[DraftEditor] 删除步骤: draft_id=${draft.draft_id}, step_id=${stepId}`);
    
    draft.steps = draft.steps.filter(s => s.id !== stepId);
    
    // 更新草案元数据
    draft.metadata.step_count = draft.steps.length;
    draft.updated_at = new Date().toISOString();
    draft.metadata.last_modified = new Date().toISOString();
    
    return draft;
  }
}