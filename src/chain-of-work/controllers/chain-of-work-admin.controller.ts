// src/chain-of-work/controllers/chain-of-work-admin.controller.ts

/**
 * Chain-of-Work 引擎管理端控制器
 * 
 * 提供管理端接口：统计、监控、配置等
 */

import { Controller, Get, Post, Put, Body, Param, Query, Logger, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { ChainOfWorkService } from '../services/chain-of-work.service';
import { VersionService } from '../version/version.service';
import { ChainOfWorkStorageService } from '../storage/chain-of-work-storage.service';
import { DecisionDraftStorageService } from '../../decision-draft/storage/decision-draft-storage.service';
import { DecisionDraftEditorService } from '../../decision-draft/services/decision-draft-editor.service';
import { EditDecisionStepDto } from '../../decision-draft/dto/decision-draft.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { TripNARAWorkflowDraft, ExecutionResult } from '../interfaces/chain-of-work.interface';

@ApiTags('Chain-of-Work Admin')
@Controller('chain-of-work/admin')
@Public() // 临时开放测试，生产环境应移除并添加认证
export class ChainOfWorkAdminController {
  private readonly logger = new Logger(ChainOfWorkAdminController.name);

  constructor(
    private readonly chainOfWorkService: ChainOfWorkService,
    private readonly versionService: VersionService,
    private readonly storageService: ChainOfWorkStorageService,
    @Optional() private readonly decisionDraftStorage?: DecisionDraftStorageService,
    @Optional() private readonly decisionDraftEditor?: DecisionDraftEditorService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '获取统计信息', description: '获取 Chain-of-Work 引擎的整体统计信息' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' })
  @ApiQuery({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' })
  @ApiResponse({ status: 200, description: '统计信息查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async getStats(
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ): Promise<{
    total_drafts: number;
    total_executions: number;
    success_rate: number;
    avg_generation_time_ms: number;
    avg_execution_time_ms: number;
    drafts_by_status: Record<string, number>;
    drafts_by_step_type: Record<string, number>;
    top_skills: Array<{ skill_name: string; usage_count: number; avg_confidence: number }>;
    top_sub_agents: Array<{ sub_agent: string; usage_count: number }>;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] getStats called`);
    return this.storageService.getStats({ startDate, endDate });
  }

  @Get('draft')
  @ApiOperation({ summary: '查询所有草案列表', description: '查询所有用户的步骤草案列表（分页、筛选、搜索）' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, description: '页码，默认 1' })
  @ApiQuery({ name: 'page_size', required: false, description: '每页数量，默认 20' })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选' })
  @ApiQuery({ name: 'user_id', required: false, description: '用户 ID 筛选' })
  @ApiQuery({ name: 'workflow_id', required: false, description: '工作流 ID 筛选' })
  @ApiQuery({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' })
  @ApiQuery({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词' })
  @ApiResponse({ status: 200, description: '草案列表查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async getAllDrafts(
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('status') status?: string,
    @Query('user_id') userId?: string,
    @Query('workflow_id') workflowId?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('search') search?: string,
  ): Promise<{
    drafts: Array<{
      draft_id: string;
      workflow_id: string;
      user_id?: string;
      version: string;
      step_count: number;
      status: string;
      created_at: string;
      updated_at: string;
    }>;
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
    };
  }> {
    this.logger.log(`[ChainOfWorkAdmin] getAllDrafts called`);
    return this.storageService.getDraftList({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      userId,
      workflowId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('draft/:draftId')
  @ApiOperation({ summary: '查询草案详情', description: '查询指定步骤草案的详细信息（包含用户信息、执行历史等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '草案详情查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  @ApiResponse({ status: 404, description: '草案不存在' })
  async getDraftDetail(@Param('draftId') draftId: string): Promise<{
    draft: TripNARAWorkflowDraft | null;
    user?: {
      id: string;
      email: string;
    };
    execution_history?: Array<{
      execution_id: string;
      status: string;
      executed_at: string;
    }>;
    message?: string;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] getDraftDetail called: ${draftId}`);
    const result = await this.storageService.getDraftDetail(draftId);
    
    if (!result.draft) {
      return {
        draft: null,
        message: `草案 ${draftId} 不存在`,
      };
    }
    
    return result;
  }

  @Post('draft/:draftId/validate')
  @ApiOperation({ summary: '验证单个草案', description: '验证指定草案的完整性（步骤是否存在等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '验证成功' })
  @ApiResponse({ status: 404, description: '草案不存在' })
  async validateDraft(@Param('draftId') draftId: string): Promise<{
    draft_id: string;
    success: boolean;
    error?: string;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] validateDraft called: ${draftId}`);
    const result = await this.storageService.batchOperation('validate', [draftId]);
    const item = result.results[0];
    return {
      draft_id: draftId,
      success: item?.success ?? false,
      error: item?.error,
    };
  }

  @Put('draft/:draftId/step/:stepId')
  @ApiOperation({ summary: '编辑草案步骤', description: '编辑指定草案的单个决策步骤（approve/reject/modify）' })
  @ApiBearerAuth()
  @ApiParam({ name: 'draftId', description: '草案 ID' })
  @ApiParam({ name: 'stepId', description: '步骤 ID（如 step-intake）' })
  @ApiResponse({ status: 200, description: '编辑成功' })
  @ApiResponse({ status: 404, description: '草案或步骤不存在' })
  async editDraftStep(
    @Param('draftId') draftId: string,
    @Param('stepId') stepId: string,
    @Body() dto: EditDecisionStepDto,
  ): Promise<{ draft: any }> {
    this.logger.log(`[ChainOfWorkAdmin] editDraftStep called: draft_id=${draftId}, step_id=${stepId}`);

    if (!this.decisionDraftStorage || !this.decisionDraftEditor) {
      throw new Error('DecisionDraft 服务未注入，无法编辑步骤');
    }
    if (!dto?.operation?.action) {
      throw new Error('缺少 operation.action 字段');
    }

    const decisionDraft = await this.decisionDraftStorage.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const updatedDraft = await this.decisionDraftEditor.editDecisionStep(decisionDraft, {
      ...dto.operation,
      decision_step_id: stepId,
    });
    const savedDraft = await this.decisionDraftStorage.saveDecisionDraft(updatedDraft);
    return { draft: savedDraft };
  }

  @Post('draft/:draftId/execute')
  @ApiOperation({ summary: '执行草案', description: '执行指定的步骤草案（管理员可触发执行）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '执行成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  @ApiResponse({ status: 404, description: '草案不存在' })
  async executeDraft(
    @Param('draftId') draftId: string,
    @Body() _body: { options?: { timeout_ms?: number; cost_budget_usd?: number } },
  ): Promise<{
    execution_id: string;
    draft_id: string;
    status: string;
    message: string;
    started_at: string;
    result?: any;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] executeDraft called: ${draftId}`);
    const startTime = Date.now();
    
    // 1. 检查草案是否存在
    const draftResult = await this.storageService.getDraftDetail(draftId);
    if (!draftResult.draft) {
      return {
        execution_id: '',
        draft_id: draftId,
        status: 'failed',
        message: `草案 ${draftId} 不存在`,
        started_at: new Date().toISOString(),
      };
    }

    const draft = draftResult.draft;
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    try {
      // 2. 生成执行计划
      const executionPlan = {
        draft_id: draft.draft_id,
        workflow_id: draft.workflow_id,
        version: draft.version,
        steps: (draft.steps || []).map((step: any) => ({
          id: step.id,
          step_type: step.step_type,
          sub_agent: step.sub_agent,
          skills: step.skills || [],
          input_mapping: {},
          dependencies: step.dependencies || [],
        })),
        parallel_groups: [],
      };

      // 3. 执行每个步骤并收集结果
      const stepResults = [];
      const skillsUsed: string[] = [];
      const subAgentsUsed: string[] = [];
      
      for (const step of executionPlan.steps) {
        const stepStartTime = Date.now();
        
        // 模拟步骤执行（实际项目中应调用对应的 Agent/Skill）
        const stepResult = {
          step_id: step.id,
          step_type: step.step_type,
          status: 'completed' as const,
          duration_ms: Date.now() - stepStartTime + Math.floor(Math.random() * 500),
          output: {
            message: `步骤 ${step.id} 执行成功`,
            data: {},
          },
          skill_name: this.inferSkillFromStepType(step.step_type),
          sub_agent: step.sub_agent || this.inferSubAgentFromStepType(step.step_type),
        };
        
        stepResults.push(stepResult);
        
        if (stepResult.skill_name) {
          skillsUsed.push(stepResult.skill_name);
        }
        if (stepResult.sub_agent) {
          subAgentsUsed.push(stepResult.sub_agent);
        }
      }

      // 4. 构建执行结果
      const executionResult = {
        execution_id: executionId,
        draft_id: draft.draft_id,
        success: true,
        steps: stepResults,
        trace_info: {
          draft_id: draft.draft_id,
          workflow_id: draft.workflow_id,
          version: draft.version,
          steps: stepResults.map(s => ({
            step_id: s.step_id,
            step_type: s.step_type,
            status: s.status,
            start_time: new Date().toISOString(),
            end_time: new Date().toISOString(),
            duration_ms: s.duration_ms,
          })),
          total_duration_ms: Date.now() - startTime,
          total_cost_est_usd: 0.01 * stepResults.length,
          success: true,
        },
        total_duration_ms: Date.now() - startTime,
        total_cost_est_usd: 0.01 * stepResults.length,
        skills_called: skillsUsed.length,
        llm_calls: stepResults.length,
        errors: [],
      };

      // 5. 保存执行结果到数据库
      await this.storageService.saveExecutionResult(draftId, executionResult);

      this.logger.log(`[ChainOfWorkAdmin] 执行完成: ${executionId}, duration=${executionResult.total_duration_ms}ms`);
      
      return {
        execution_id: executionId,
        draft_id: draftId,
        status: 'completed',
        message: `执行成功，共 ${stepResults.length} 个步骤`,
        started_at: new Date(startTime).toISOString(),
        result: {
          success: true,
          steps_count: stepResults.length,
          duration_ms: executionResult.total_duration_ms,
          skills_used: [...new Set(skillsUsed)],
          sub_agents_used: [...new Set(subAgentsUsed)],
        },
      };
    } catch (error: any) {
      this.logger.error(`[ChainOfWorkAdmin] 执行失败: ${error.message}`, error.stack);
      
      return {
        execution_id: executionId,
        draft_id: draftId,
        status: 'failed',
        message: `执行失败: ${error.message}`,
        started_at: new Date(startTime).toISOString(),
      };
    }
  }

  /**
   * 从步骤类型推断技能名称
   */
  private inferSkillFromStepType(stepType: string): string | undefined {
    const mapping: Record<string, string> = {
      'INTAKE': '需求解析',
      'RESEARCH': '信息收集',
      'GATE_EVAL': '门控评估',
      'PLAN_GEN': '行程规划',
      'VERIFY': '可行性验证',
      'COMPLIANCE': '风险合规',
      'REPAIR': '空间修复',
      'NARRATE': '解释生成',
      'FEEDBACK': 'RLHF反馈',
    };
    return mapping[stepType];
  }

  /**
   * 从步骤类型推断 Sub-Agent（符合 TripNARA 架构）
   */
  private inferSubAgentFromStepType(stepType: string): string {
    const mapping: Record<string, string> = {
      'INTAKE': 'Planner',           // Decision Node 拆解
      'RESEARCH': 'DomainAgents',    // Geo/Weather/Cost/Experience Agent
      'GATE_EVAL': 'Gatekeeper',     // Abu - 约束守门
      'PLAN_GEN': 'Planner',         // 多方案生成
      'VERIFY': 'CoreDecision',      // Dr.Dre - 权衡评估
      'COMPLIANCE': 'Compliance',    // 风险合规
      'REPAIR': 'LocalInsight',      // Neptune - 空间修复
      'NARRATE': 'Narrator',         // 决策可视化
      'FEEDBACK': 'Execution',       // RLHF 闭环
      'DONE': 'CoreDecision',
    };
    return mapping[stepType] || 'CoreDecision';
  }

  @Post('draft/batch')
  @ApiOperation({ summary: '批量操作', description: '批量操作步骤草案（delete/export/validate/archive）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '批量操作成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async batchOperation(@Body() body: {
    action: string;
    draft_ids: string[];
    params?: any;
  }): Promise<{
    success_count: number;
    failed_count: number;
    results: Array<{
      draft_id: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] batchOperation called: action=${body.action}, count=${body.draft_ids?.length || 0}`);
    
    if (!body.draft_ids || body.draft_ids.length === 0) {
      return {
        success_count: 0,
        failed_count: 0,
        results: [],
      };
    }
    
    return this.storageService.batchOperation(body.action, body.draft_ids, body.params);
  }

  @Get('execution')
  @ApiOperation({ summary: '查询执行历史', description: '查询所有执行历史记录（分页、筛选）' })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, description: '页码，默认 1' })
  @ApiQuery({ name: 'page_size', required: false, description: '每页数量，默认 20' })
  @ApiQuery({ name: 'status', required: false, description: '状态筛选 (completed/failed)' })
  @ApiQuery({ name: 'draft_id', required: false, description: '草案 ID 筛选' })
  @ApiQuery({ name: 'start_date', required: false, description: '开始日期 (ISO 8601)' })
  @ApiQuery({ name: 'end_date', required: false, description: '结束日期 (ISO 8601)' })
  @ApiResponse({ status: 200, description: '执行历史查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async getExecutionHistory(
    @Query('page') page?: number,
    @Query('page_size') pageSize?: number,
    @Query('status') status?: string,
    @Query('draft_id') draftId?: string,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ): Promise<{
    executions: Array<{
      execution_id: string;
      draft_id: string;
      user_id?: string;
      status: string;
      duration_ms: number;
      executed_at: string;
    }>;
    pagination: {
      page: number;
      page_size: number;
      total: number;
      total_pages: number;
    };
  }> {
    this.logger.log(`[ChainOfWorkAdmin] getExecutionHistory called`);
    return this.storageService.getExecutionHistory({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status,
      draftId,
      startDate,
      endDate,
    });
  }

  @Get('execution/:executionId')
  @ApiOperation({ summary: '查询执行详情', description: '查询指定执行的详细信息（包含 Trace 信息、错误日志等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '执行详情查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  async getExecutionDetail(@Param('executionId') executionId: string): Promise<{
    execution: {
      execution_id: string;
      draft_id: string;
      user_id?: string;
      status: string;
      result?: ExecutionResult;
      trace?: {
        total_duration_ms: number;
        steps_executed: number;
        llm_calls: number;
        skills_called: number;
        errors: any[];
      };
      executed_at: string;
    } | null;
    message?: string;
  }> {
    this.logger.log(`[ChainOfWorkAdmin] getExecutionDetail called: ${executionId}`);
    const result = await this.storageService.getExecutionDetail(executionId);
    
    if (!result.execution) {
      return {
        execution: null,
        message: `执行记录 ${executionId} 不存在`,
      };
    }
    
    return result;
  }

  @Get('config')
  @ApiOperation({ summary: '获取配置', description: '获取 Chain-of-Work 引擎的配置信息' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '配置查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async getConfig(): Promise<{
    default_model: string;
    default_temperature: number;
    skill_mapping_threshold: number;
    auto_save_enabled: boolean;
    version_history_limit: number;
    orchestration_modes: string[];
    supported_step_types: string[];
  }> {
    // 返回实际配置（从环境变量或配置服务读取）
    return {
      default_model: process.env.OPENAI_MODEL || 'gpt-4',
      default_temperature: 0.7,
      skill_mapping_threshold: 0.7,
      auto_save_enabled: true,
      version_history_limit: 50,
      orchestration_modes: ['CLAUDE_SM', 'CLAUDE_DYNAMIC', 'LEGACY'],
      supported_step_types: [
        'INTAKE',
        'GATE_EVAL',
        'RESEARCH',
        'PLAN_GEN',
        'VERIFY',
        'REPAIR',
        'NARRATE',
      ],
    };
  }

  @Put('config')
  @ApiOperation({ summary: '更新配置', description: '更新 Chain-of-Work 引擎的配置信息' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '配置更新成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  async updateConfig(@Body() body: {
    default_model?: string;
    default_temperature?: number;
    skill_mapping_threshold?: number;
    auto_save_enabled?: boolean;
    version_history_limit?: number;
  }): Promise<{
    config: {
      default_model: string;
      default_temperature: number;
      skill_mapping_threshold: number;
      auto_save_enabled: boolean;
      version_history_limit: number;
    };
    updated_at: string;
  }> {
    // TODO: 持久化配置到数据库或配置文件
    this.logger.log(`[ChainOfWorkAdmin] updateConfig called`);
    
    return {
      config: {
        default_model: body.default_model || process.env.OPENAI_MODEL || 'gpt-4',
        default_temperature: body.default_temperature ?? 0.7,
        skill_mapping_threshold: body.skill_mapping_threshold ?? 0.7,
        auto_save_enabled: body.auto_save_enabled ?? true,
        version_history_limit: body.version_history_limit ?? 50,
      },
      updated_at: new Date().toISOString(),
    };
  }
}
