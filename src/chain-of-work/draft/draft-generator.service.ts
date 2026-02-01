// src/chain-of-work/draft/draft-generator.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { TripPlanRequest, OrchestrationStep } from '../../agent/interfaces/trip-plan.interface';
import { LlmService } from '../../llm/services/llm.service';
import { LlmProvider } from '../../llm/dto/llm-request.dto';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import {
  TripNARAWorkflowDraft,
  TripNARAStepDraft,
  DraftGenerationConfig,
} from '../interfaces/chain-of-work.interface';
import { buildDraftGenerationPrompt } from './prompts/draft-generation.prompt';

/**
 * 步骤草案生成器
 */
@Injectable()
export class DraftGeneratorService {
  private readonly logger = new Logger(DraftGeneratorService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly skillsRegistry: SkillsRegistryService,
  ) {}

  /**
   * 生成步骤草案
   */
  async generateDraft(
    request: TripPlanRequest,
    config?: DraftGenerationConfig,
  ): Promise<TripNARAWorkflowDraft> {
    this.logger.log(`[DraftGenerator] 开始生成步骤草案: request_id=${request.request_id}`);
    
    const startTime = Date.now();
    
    try {
      // 1. 获取可用 Skills 列表
      const availableSkills = this.skillsRegistry.getAllSkills();
      
      // 2. 构建提示词（使用优化的提示词模板）
      const prompt = buildDraftGenerationPrompt(request, availableSkills);
      
      // 3. 确定 LLM 提供商
      const provider = this.mapModelToProvider(config?.model || 'claude-3-5-sonnet');
      
      // 4. 构建 JSON Schema
      const schema = this.getDraftGenerationSchema();
      
      // 5. 调用 LLM 生成步骤草案
      let draft: TripNARAWorkflowDraft;
      
      try {
        this.logger.debug(`[DraftGenerator] 调用 LLM 生成步骤草案: provider=${provider}, prompt_length=${prompt.length}`);
        const response = await this.llmService.callLlmWithSchema(provider, prompt, schema);
        
        // 提取和解析 JSON
        const draftData = this.extractJSON(response);
        this.logger.debug(`[DraftGenerator] LLM 响应解析成功: steps_count=${draftData.steps?.length || 0}`);
        
        // 解析为 WorkflowDraft
        draft = this.parseDraft(draftData, request);
        this.logger.debug(`[DraftGenerator] LLM 生成成功，解析了 ${draft.steps.length} 个步骤`);
        
        // 验证步骤完整性
        const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'];
        const missingSteps = requiredSteps.filter(step => !draft.steps.some(s => s.step_type === step));
        if (missingSteps.length > 0) {
          this.logger.warn(`[DraftGenerator] LLM 生成缺少步骤: ${missingSteps.join(', ')}，已自动补充`);
        }
      } catch (llmError: any) {
        this.logger.warn(`[DraftGenerator] LLM 生成失败，使用模板化步骤草案: ${llmError.message}`, llmError.stack);
        // 降级到模板化步骤草案
        draft = this.generateTemplateDraft(request);
      }
      
      const duration = Date.now() - startTime;
      this.logger.log(`[DraftGenerator] 步骤草案生成完成: duration=${duration}ms, steps=${draft.steps.length}`);
      
      return draft;
    } catch (error: any) {
      this.logger.error(`[DraftGenerator] 步骤草案生成失败: ${error?.message || 'Unknown error'}`, error?.stack);
      throw error;
    }
  }
  
  /**
   * 将模型名称映射到 LLM 提供商
   */
  private mapModelToProvider(model: string): LlmProvider {
    if (model.includes('claude') || model.includes('anthropic')) {
      return LlmProvider.ANTHROPIC;
    } else if (model.includes('gpt') || model.includes('openai')) {
      return LlmProvider.OPENAI;
    } else if (model.includes('deepseek')) {
      return LlmProvider.DEEPSEEK;
    } else if (model.includes('gemini')) {
      return LlmProvider.GEMINI;
    }
    // 默认使用 Anthropic（Claude）
    return LlmProvider.ANTHROPIC;
  }
  
  /**
   * 从响应中提取 JSON
   */
  private extractJSON(response: string): any {
    let cleaned = response.trim();
    
    // 移除 markdown 代码块标记
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    cleaned = cleaned.trim();
    
    // 尝试提取 JSON 对象（如果响应中包含其他文本）
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    }
    
    return JSON.parse(cleaned);
  }
  
  /**
   * 解析 LLM 响应，生成 WorkflowDraft
   */
  private parseDraft(draftData: any, request: TripPlanRequest): TripNARAWorkflowDraft {
    const now = new Date().toISOString();
    const steps: TripNARAStepDraft[] = (draftData.steps || []).map((stepData: any, index: number) => ({
      id: stepData.id || `step-${index + 1}`,
      step_type: stepData.step_type || this.inferStepType(stepData.title || stepData.description),
      title: stepData.title || stepData.step_type || `步骤 ${index + 1}`,
      description: stepData.description || '',
      status: 'draft',
      priority: stepData.priority || 10 - index,
      conditions: stepData.conditions,
      version: 1,
      created_at: now,
      updated_at: now,
    }));
    
    // 确保包含所有必需的步骤
    const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'];
    const existingStepTypes = steps.map(s => s.step_type);
    
    // 如果缺少某些步骤，使用模板补充
    const templateDraft = this.generateTemplateDraft(request);
    for (const requiredStep of requiredSteps as OrchestrationStep[]) {
      if (!existingStepTypes.includes(requiredStep)) {
        const templateStep = templateDraft.steps.find(s => s.step_type === requiredStep);
        if (templateStep) {
          steps.push(templateStep);
        }
      }
    }
    
    // 按顺序排序
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
    steps.sort((a, b) => (stepOrder[a.step_type] || 99) - (stepOrder[b.step_type] || 99));
    
    // 验证步骤顺序（GATE_EVAL 必须在 PLAN_GEN 之前）
    const gateEvalIndex = steps.findIndex(s => s.step_type === 'GATE_EVAL');
    const planGenIndex = steps.findIndex(s => s.step_type === 'PLAN_GEN');
    if (gateEvalIndex !== -1 && planGenIndex !== -1 && gateEvalIndex >= planGenIndex) {
      this.logger.warn(`[DraftGenerator] 步骤顺序错误：GATE_EVAL (${gateEvalIndex}) >= PLAN_GEN (${planGenIndex})，已自动修正`);
      // 自动修正：交换位置
      const gateStep = steps[gateEvalIndex];
      steps[gateEvalIndex] = steps[planGenIndex];
      steps[planGenIndex] = gateStep;
    }
    
    return {
      draft_id: `draft-${request.request_id}`,
      workflow_id: request.request_id,
      version: 'v1.0',
      steps,
      orchestration_mode: 'CLAUDE_SM',
      trip_plan_request: request,
      metadata: {
        step_count: steps.length,
        skills_count: steps.filter(s => s.skills && s.skills.length > 0).length,
        sub_agents_count: steps.filter(s => s.sub_agent).length,
        last_modified: now,
        created_by: 'system',
      },
      created_at: now,
      updated_at: now,
    };
  }
  
  /**
   * 从标题或描述推断步骤类型
   */
  private inferStepType(text: string): string {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('intake') || lowerText.includes('解析') || lowerText.includes('识别')) {
      return 'INTAKE';
    } else if (lowerText.includes('research') || lowerText.includes('收集') || lowerText.includes('获取')) {
      return 'RESEARCH';
    } else if (lowerText.includes('gate') || lowerText.includes('门控') || lowerText.includes('决策')) {
      return 'GATE_EVAL';
    } else if (lowerText.includes('plan') || lowerText.includes('生成') || lowerText.includes('行程')) {
      return 'PLAN_GEN';
    } else if (lowerText.includes('verify') || lowerText.includes('验证') || lowerText.includes('检查')) {
      return 'VERIFY';
    } else if (lowerText.includes('repair') || lowerText.includes('修复') || lowerText.includes('调整')) {
      return 'REPAIR';
    } else if (lowerText.includes('narrate') || lowerText.includes('解释') || lowerText.includes('说明')) {
      return 'NARRATE';
    } else if (lowerText.includes('done') || lowerText.includes('完成')) {
      return 'DONE';
    }
    return 'INTAKE'; // 默认
  }
  
  /**
   * 获取步骤草案生成的 JSON Schema
   */
  private getDraftGenerationSchema(): any {
    return {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              step_type: {
                type: 'string',
                enum: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'REPAIR', 'NARRATE', 'DONE'],
              },
              title: { type: 'string' },
              description: { type: 'string' },
              priority: { type: 'number', minimum: 1, maximum: 10 },
              skills: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['id', 'step_type', 'title', 'description'],
          },
        },
      },
      required: ['steps'],
    };
  }


  /**
   * 生成模板化的步骤草案（用于技术预研）
   */
  private generateTemplateDraft(request: TripPlanRequest): TripNARAWorkflowDraft {
    const now = new Date().toISOString();
    const steps: TripNARAStepDraft[] = [
      {
        id: 'step-intake',
        step_type: 'INTAKE',
        title: '解析用户需求',
        description: '解析用户旅行需求，识别信息缺口',
        status: 'draft',
        priority: 10,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-research',
        step_type: 'RESEARCH',
        title: '收集硬数据',
        description: '调用 Skills 获取交通、POI、开放时间、DEM 等硬数据',
        status: 'draft',
        priority: 9,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-gate-eval',
        step_type: 'GATE_EVAL',
        title: '执行 Should-Exist Gate 决策',
        description: '判断路线是否应该存在，执行三人格评审',
        status: 'draft',
        priority: 10,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-plan-gen',
        step_type: 'PLAN_GEN',
        title: '生成结构化行程草案',
        description: '生成包含时间窗、地点、可达性证据的行程草案',
        status: 'draft',
        priority: 8,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-verify',
        step_type: 'VERIFY',
        title: '验证行程可执行性',
        description: '验证开放时间冲突、换乘 buffer、可达性、疲劳阈值',
        status: 'draft',
        priority: 7,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-repair',
        step_type: 'REPAIR',
        title: '修复不可执行问题',
        description: '替换POI、改路线、加buffer、换交通（条件执行）',
        status: 'draft',
        priority: 6,
        conditions: '仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行',
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-narrate',
        step_type: 'NARRATE',
        title: '生成用户可读解释',
        description: '产出用户可读解释（不得改硬字段）',
        status: 'draft',
        priority: 5,
        version: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-done',
        step_type: 'DONE',
        title: '完成',
        description: '规划完成',
        status: 'draft',
        priority: 1,
        version: 1,
        created_at: now,
        updated_at: now,
      },
    ];

    return {
      draft_id: `draft-${request.request_id}`,
      workflow_id: request.request_id,
      version: 'v1.0',
      steps,
      orchestration_mode: 'CLAUDE_SM',
      trip_plan_request: request,
      metadata: {
        step_count: steps.length,
        skills_count: 0,
        sub_agents_count: 0,
        last_modified: now,
        created_by: 'system',
      },
      created_at: now,
      updated_at: now,
    };
  }
}