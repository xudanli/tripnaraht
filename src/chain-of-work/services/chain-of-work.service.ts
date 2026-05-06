// src/chain-of-work/services/chain-of-work.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import {
  TripNARAWorkflowDraft,
  DraftGenerationConfig,
  DraftValidationResult,
  ExecutionPlan,
  ExecutionResult,
} from '../interfaces/chain-of-work.interface';
import { DraftGeneratorService } from '../draft/draft-generator.service';
import { DraftValidatorService } from '../draft/draft-validator.service';
import { SkillMappingService } from '../mapping/skill/skill-mapping.service';
import { SubAgentMappingService } from '../mapping/sub-agent/sub-agent-mapping.service';
import { ExecutionPlanGeneratorService } from '../execution/execution-plan-generator.service';
import { ExecutionIntegrationService } from '../execution/execution-integration.service';

/**
 * Chain-of-Work 核心服务
 */
@Injectable()
export class ChainOfWorkService {
  private readonly logger = new Logger(ChainOfWorkService.name);

  constructor(
    private readonly draftGenerator: DraftGeneratorService,
    private readonly draftValidator: DraftValidatorService,
    private readonly skillMapping: SkillMappingService,
    private readonly subAgentMapping: SubAgentMappingService,
    private readonly executionPlanGenerator: ExecutionPlanGeneratorService,
    private readonly executionIntegration: ExecutionIntegrationService,
  ) {}

  /**
   * 生成步骤草案
   */
  async generateDraft(
    request: TripPlanRequest,
    config?: DraftGenerationConfig,
  ): Promise<TripNARAWorkflowDraft> {
    this.logger.log(`[ChainOfWorkService] 开始生成步骤草案: request_id=${request.request_id}`);
    
    const startTime = Date.now();
    
    try {
      // 1. 生成步骤草案
      const draft = await this.draftGenerator.generateDraft(request, config);
      
      // 2. 验证步骤草案
      const validation = await this.draftValidator.validateDraft(draft);
      if (!validation.valid) {
        this.logger.warn(`[ChainOfWorkService] 步骤草案验证失败: ${validation.errors.length} 个错误`);
        // 可以选择修复错误或返回验证结果
      }
      
      // 3. Skills 映射
      for (const step of draft.steps) {
        if (step.step_type === 'RESEARCH') {
          const skillMappings = await this.skillMapping.mapStepToSkills(step, draft.orchestrator_state);
          step.skills = skillMappings;
        }
      }
      
      // 4. Sub-Agents 映射
      for (const step of draft.steps) {
        if (['INTAKE', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE'].includes(step.step_type)) {
          const subAgentMapping = await this.subAgentMapping.mapStepToSubAgent(step, draft.orchestrator_state);
          step.sub_agent = subAgentMapping.sub_agent;
          step.guardian = subAgentMapping.guardian ?? undefined;
        }
      }
      
      const duration = Date.now() - startTime;
      this.logger.log(`[ChainOfWorkService] 步骤草案生成完成: duration=${duration}ms`);
      
      return draft;
    } catch (error: any) {
      this.logger.error(`[ChainOfWorkService] 步骤草案生成失败: ${error?.message || 'Unknown error'}`, error?.stack);
      throw error;
    }
  }

  /**
   * 验证步骤草案
   */
  async validateDraft(draft: TripNARAWorkflowDraft): Promise<DraftValidationResult> {
    return this.draftValidator.validateDraft(draft);
  }

  /**
   * 生成执行计划
   */
  async generateExecutionPlan(draft: TripNARAWorkflowDraft): Promise<ExecutionPlan> {
    return this.executionPlanGenerator.generatePlan(draft);
  }

  /**
   * 执行规划
   */
  async executePlan(
    plan: ExecutionPlan,
    request: TripPlanRequest,
  ): Promise<ExecutionResult> {
    return this.executionIntegration.executePlan(plan, request);
  }

  /**
   * 映射步骤到 Skills（供管理端使用）
   */
  async mapStepToSkills(step: any, context?: any) {
    return this.skillMapping.mapStepToSkills(step, context);
  }

  /**
   * 映射步骤到 Sub-Agent（供管理端使用）
   */
  async mapStepToSubAgent(step: any, context?: any) {
    return this.subAgentMapping.mapStepToSubAgent(step, context);
  }
}