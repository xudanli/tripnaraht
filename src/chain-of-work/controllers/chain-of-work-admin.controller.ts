// src/chain-of-work/controllers/chain-of-work-admin.controller.ts

/**
 * Chain-of-Work 引擎管理端控制器
 * 
 * 提供管理端接口：统计、监控、配置等
 */

import { Controller, Get, Post, Put, Body, Param, Query, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ChainOfWorkService } from '../services/chain-of-work.service';
import { VersionService } from '../version/version.service';
// TODO: 导入认证 Guard（待实现）
// import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../../auth/guards/roles.guard';
// import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Chain-of-Work Admin')
@Controller('chain-of-work/admin')
// @UseGuards(JwtAuthGuard, RolesGuard) // TODO: 启用认证和权限控制（待实现）
// @Roles('admin') // TODO: 需要管理员权限（待实现）
export class ChainOfWorkAdminController {
  private readonly logger = new Logger(ChainOfWorkAdminController.name);

  constructor(
    private readonly chainOfWorkService: ChainOfWorkService,
    private readonly versionService: VersionService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '获取统计信息', description: '获取 Chain-of-Work 引擎的整体统计信息' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '统计信息查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    // TODO: 实现统计信息查询（需要数据库支持）
    this.logger.warn('[ChainOfWorkAdmin] getStats 未实现，返回模拟数据');
    
    return {
      total_drafts: 0,
      total_executions: 0,
      success_rate: 0,
      avg_generation_time_ms: 0,
      avg_execution_time_ms: 0,
      drafts_by_status: {},
      drafts_by_step_type: {},
      top_skills: [],
      top_sub_agents: [],
    };
  }

  @Get('draft')
  @ApiOperation({ summary: '查询所有草案列表', description: '查询所有用户的步骤草案列表（分页、筛选、搜索）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '草案列表查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    // TODO: 实现草案列表查询（需要数据库支持）
    this.logger.warn('[ChainOfWorkAdmin] getAllDrafts 未实现，返回空列表');
    
    return {
      drafts: [],
      pagination: {
        page: page || 1,
        page_size: pageSize || 20,
        total: 0,
        total_pages: 0,
      },
    };
  }

  @Get('draft/:draftId')
  @ApiOperation({ summary: '查询草案详情', description: '查询指定步骤草案的详细信息（包含用户信息、执行历史等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '草案详情查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  @ApiResponse({ status: 404, description: '草案不存在' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
  async getDraftDetail(@Param('draftId') draftId: string): Promise<{
    draft: TripNARAWorkflowDraft;
    user?: {
      id: string;
      email: string;
    };
    execution_history?: Array<{
      execution_id: string;
      status: string;
      executed_at: string;
    }>;
  }> {
    // TODO: 实现草案详情查询（需要数据库支持）
    throw new Error('Not implemented');
  }

  @Post('draft/batch')
  @ApiOperation({ summary: '批量操作', description: '批量操作步骤草案（删除、导出、验证等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '批量操作成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    // TODO: 实现批量操作（需要数据库支持）
    throw new Error('Not implemented');
  }

  @Get('execution')
  @ApiOperation({ summary: '查询执行历史', description: '查询所有执行历史记录（分页、筛选）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '执行历史查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    // TODO: 实现执行历史查询（需要数据库支持）
    this.logger.warn('[ChainOfWorkAdmin] getExecutionHistory 未实现，返回空列表');
    
    return {
      executions: [],
      pagination: {
        page: page || 1,
        page_size: pageSize || 20,
        total: 0,
        total_pages: 0,
      },
    };
  }

  @Get('execution/:executionId')
  @ApiOperation({ summary: '查询执行详情', description: '查询指定执行的详细信息（包含 Trace 信息、错误日志等）' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '执行详情查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  @ApiResponse({ status: 404, description: '执行不存在' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    };
  }> {
    // TODO: 实现执行详情查询（需要数据库支持）
    throw new Error('Not implemented');
  }

  @Get('config')
  @ApiOperation({ summary: '获取配置', description: '获取 Chain-of-Work 引擎的配置信息' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '配置查询成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
  async getConfig(): Promise<{
    default_model: string;
    default_temperature: number;
    skill_mapping_threshold: number;
    auto_save_enabled: boolean;
    version_history_limit: number;
  }> {
    // TODO: 从配置服务或数据库读取配置
    return {
      default_model: 'claude-3-5-sonnet',
      default_temperature: 0.7,
      skill_mapping_threshold: 0.7,
      auto_save_enabled: true,
      version_history_limit: 50,
    };
  }

  @Put('config')
  @ApiOperation({ summary: '更新配置', description: '更新 Chain-of-Work 引擎的配置信息' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '配置更新成功' })
  @ApiResponse({ status: 403, description: '禁止访问（需要管理员权限）' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
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
    // TODO: 更新配置（需要配置服务或数据库支持）
    this.logger.warn('[ChainOfWorkAdmin] updateConfig 未实现，返回模拟数据');
    
    return {
      config: {
        default_model: body.default_model || 'claude-3-5-sonnet',
        default_temperature: body.default_temperature ?? 0.7,
        skill_mapping_threshold: body.skill_mapping_threshold ?? 0.7,
        auto_save_enabled: body.auto_save_enabled ?? true,
        version_history_limit: body.version_history_limit ?? 50,
      },
      updated_at: new Date().toISOString(),
    };
  }
}

// 导入类型（避免循环依赖）
import { TripNARAWorkflowDraft, ExecutionResult } from '../interfaces/chain-of-work.interface';