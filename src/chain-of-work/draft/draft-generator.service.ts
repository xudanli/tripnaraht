// src/chain-of-work/draft/draft-generator.service.ts

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
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
    @Inject(forwardRef(() => SkillsRegistryService))
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
        
        // 验证步骤完整性（10步完整流程）
        const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'];
        const missingSteps = requiredSteps.filter(step => !draft.steps.some(s => s.step_type === step));
        if (missingSteps.length > 0) {
          this.logger.warn(`[DraftGenerator] LLM 生成缺少步骤: ${missingSteps.join(', ')}，使用完整模板`);
          // 如果缺少任何步骤，直接使用模板（确保 10 步完整性）
          draft = this.generateTemplateDraft(request);
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
    
    // 确保包含所有必需的步骤（10步完整流程）
    const requiredSteps = ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'];
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
                enum: ['INTAKE', 'RESEARCH', 'GATE_EVAL', 'PLAN_GEN', 'VERIFY', 'COMPLIANCE', 'REPAIR', 'NARRATE', 'FEEDBACK', 'DONE'],
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
   * 生成模板化的步骤草案（符合 TripNARA 架构设计）
   * 
   * 10 步完整流程：
   * 1. INTAKE      → Planner        解析需求、识别缺口
   * 2. RESEARCH    → Domain Agents  调用 Geo/Weather/Cost/Experience Agent
   * 3. GATE_EVAL   → Gatekeeper/Abu Should-Exist Gate 安全检查
   * 4. PLAN_GEN    → Planner        生成 Plan A/B/C 多方案
   * 5. VERIFY      → CoreDecision   Dr.Dre 节奏评估 + 冲突检测
   * 6. COMPLIANCE  → Compliance     风险分类 + 合规检查
   * 7. REPAIR      → LocalInsight   Neptune 空间修复
   * 8. NARRATE     → Narrator       决策理由可视化
   * 9. FEEDBACK    → Execution      RLHF 信号采集
   * 10. DONE       → -              输出最终结果
   */
  private generateTemplateDraft(request: TripPlanRequest): TripNARAWorkflowDraft {
    const now = new Date().toISOString();
    const steps: TripNARAStepDraft[] = [
      {
        id: 'step-intake',
        step_type: 'INTAKE',
        title: '解析用户需求',
        description: '解析用户的旅行需求，提取关键信息（起点、终点、日期、交通方式、人员配置、约束条件等），识别信息缺口，为后续 RESEARCH 步骤做准备',
        status: 'draft',
        priority: 10,
        version: 1,
        sub_agent: 'Planner',
        skills: ['需求解析', '缺口识别'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-research',
        step_type: 'RESEARCH',
        title: '收集硬数据',
        description: '调用 Domain Agents 获取完整的决策所需数据，包括交通路线、POI信息、开放时间、地形高程、天气、风险区域等硬数据',
        status: 'draft',
        priority: 9,
        version: 1,
        domain_agents: ['GeoAgent', 'WeatherAgent', 'CostAgent', 'ExperienceAgent'],
        skills: ['路线规划', '天气预报查询', 'POI搜索', '费用估算', '体验评估'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-gate-eval',
        step_type: 'GATE_EVAL',
        title: '执行 Should-Exist Gate 决策',
        description: '基于收集的硬数据，执行三人格策略编排（Abu安全检查 → Dr.Dre节奏评估 → Neptune空间修复），判断行程方案是否应该存在，输出 GateResult（ALLOW/BLOCK/ADJUST_REQUIRED/NEED_USER_CONFIRM）',
        status: 'draft',
        priority: 10,
        version: 1,
        sub_agent: 'Gatekeeper',
        guardian: 'ABU',
        skills: ['门控评估', '安全检查'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-plan-gen',
        step_type: 'PLAN_GEN',
        title: '生成结构化行程草案',
        description: '仅在 Gate 结果为 ALLOW 或 ADJUST_REQUIRED 时执行。生成 Plan A（最优体验）、Plan B（稳妥方案）、Plan C（保底方案），每个方案包含时间窗、地点、可达性证据、疲劳评分和风险概率',
        status: 'draft',
        priority: 8,
        version: 1,
        sub_agent: 'Planner',
        conditions: '仅在 gate_result = ALLOW 或 ADJUST_REQUIRED 时执行',
        skills: ['行程规划', '多方案生成'],
        outputs: ['plan_a', 'plan_b', 'plan_c'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-verify',
        step_type: 'VERIFY',
        title: '验证行程可执行性',
        description: '对生成的行程草案进行完整验证，检查开放时间冲突、换乘buffer充足性、可达性、疲劳阈值、天气风险等，输出验证结果和冲突列表',
        status: 'draft',
        priority: 7,
        version: 1,
        sub_agent: 'CoreDecision',
        guardian: 'DR_DRE',
        skills: ['可行性验证', '节奏评估', '冲突检测'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-compliance',
        step_type: 'COMPLIANCE',
        title: '风险分类与合规检查',
        description: '执行风险分类（高/中/低）、合规检查（签证、保险、健康要求）、免责声明生成，确保所有风险点都有明确的用户知情确认',
        status: 'draft',
        priority: 6,
        version: 1,
        sub_agent: 'Compliance',
        skills: ['风险分类', '合规检查', '免责留痕'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-repair',
        step_type: 'REPAIR',
        title: '修复不可执行问题',
        description: '仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行。根据验证结果，执行修复方案：替换不可用的POI、调整路线、增加缓冲时间、更换交通方式或降级难度，保持路线哲学不变',
        status: 'draft',
        priority: 5,
        version: 1,
        sub_agent: 'LocalInsight',
        guardian: 'NEPTUNE',
        conditions: '仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行',
        skills: ['空间修复', '替代方案', '路线调整'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-narrate',
        step_type: 'NARRATE',
        title: '生成用户可读解释',
        description: '将技术性的决策日志和行程数据转换为用户可读的解释，包括三人格的工作说明、关键风险点、取舍决策、行前准备建议等，不修改任何硬字段',
        status: 'draft',
        priority: 4,
        version: 1,
        sub_agent: 'Narrator',
        skills: ['解释生成', '决策可视化'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-feedback',
        step_type: 'FEEDBACK',
        title: 'RLHF 信号采集',
        description: '收集用户反馈信号（方案选择、修改偏好、执行偏差），用于决策质量自学习和风格建模',
        status: 'draft',
        priority: 3,
        version: 1,
        sub_agent: 'CoreDecision', // RLHF 信号采集由 CoreDecision 处理
        skills: ['信号采集', '偏差分析', 'RLHF反馈'],
        created_at: now,
        updated_at: now,
      },
      {
        id: 'step-done',
        step_type: 'DONE',
        title: '完成',
        description: '规划流程完成，输出最终结果包括结构化行程、用户解释、决策日志和行前准备清单',
        status: 'draft',
        priority: 1,
        version: 1,
        outputs: ['itinerary', 'explanation', 'decision_log', 'preparation_checklist'],
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
        skills_count: steps.reduce((sum, s) => sum + (s.skills?.length || 0), 0),
        sub_agents_count: steps.filter(s => s.sub_agent).length,
        last_modified: now,
        created_by: 'system',
      },
      created_at: now,
      updated_at: now,
    };
  }
}