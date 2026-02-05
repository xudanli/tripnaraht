// src/decision-draft/controllers/decision-draft.controller.ts

/**
 * Decision Draft Controller（统一接口）
 * 
 * 统一API接口，通过权限控制区分用户端和管理端功能
 * - 普通用户：查看、解释、轻量编辑
 * - Expert用户：完整编辑、批量操作
 * - Studio/Admin用户：完整CRUD、调试信息、统计
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { DecisionDraftGeneratorService } from '../services/decision-draft-generator.service';
import { DecisionExplanationService } from '../services/decision-explanation.service';
import { DecisionDraftVersionService } from '../services/decision-draft-version.service';
import { DecisionDraftStorageService } from '../storage/decision-draft-storage.service';
import { DecisionDraftEditorService } from '../services/decision-draft-editor.service';
import {
  GetExplanationQueryDto,
  EditDecisionStepDto,
  GenerateDecisionDraftDto,
  BatchEditDecisionStepsDto,
  PartialRegenerateDto,
  ReorderDecisionStepsDto,
  SaveVersionDto,
  ForkVersionDto,
} from '../dto/decision-draft.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { ForbiddenException } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { StudioModeGuard, RequireStudio } from '../guards/studio-mode.guard';
// TODO: Import authentication guards
// import { JwtAuthGuard, RolesGuard } from '../../auth/guards/jwt-auth.guard';
// import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Decision Draft')
@Controller('decision-draft')
@Public() // 临时开放测试，生产环境应移除并启用认证
// @UseGuards(JwtAuthGuard) // TODO: 启用认证（待实现）
export class DecisionDraftController {
  private readonly logger = new Logger(DecisionDraftController.name);

  constructor(
    private readonly decisionDraftGenerator: DecisionDraftGeneratorService,
    private readonly explanationService: DecisionExplanationService,
    private readonly versionService: DecisionDraftVersionService,
    private readonly storageService: DecisionDraftStorageService,
    private readonly editorService: DecisionDraftEditorService,
  ) {}

  /**
   * 🆕 根据 tripId 获取决策草案
   * 
   * 用户端接口：通过 tripId 查询决策草案（用于自然语言创建的行程）
   */
  @Get('trip/:tripId')
  @ApiOperation({
    summary: '根据 tripId 获取决策草案',
    description: '通过 tripId 查询关联的决策草案（仅适用于自然语言创建的行程）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '决策草案获取成功' })
  @ApiResponse({ status: 404, description: '决策草案不存在或行程不是自然语言创建' })
  async getDecisionDraftByTripId(@Param('tripId') tripId: string): Promise<{
    draft_id: string;
    decision_steps: any[]; // DecisionStep[]
    step_draft?: any; // TripNARAWorkflowDraft
    user_mode: 'toc' | 'expert';
    metadata: any;
  }> {
    this.logger.log(`[DecisionDraftController] 根据 tripId 获取决策草案: tripId=${tripId}`);

    const decisionDraft = await this.storageService.loadDecisionDraftByTripId(tripId);
    if (!decisionDraft) {
      throw new Error(`行程 ${tripId} 没有关联的决策草案。只有通过自然语言创建的行程才会生成决策草案。`);
    }

    // 根据用户模式决定是否返回 step_draft 和 debug_info
    const response: any = {
      draft_id: decisionDraft.draft_id,
      decision_steps: decisionDraft.decision_steps,
      user_mode: decisionDraft.user_mode,
      metadata: decisionDraft.metadata,
    };

    // Expert 和 Studio 模式返回 step_draft
    if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
      response.step_draft = decisionDraft.step_draft;
    }

    // Studio 模式返回 debug_info
    if (decisionDraft.user_mode === 'studio') {
      response.debug_info = decisionDraft.debug_info;
    }

    return response;
  }

  /**
   * 获取统计信息
   * 
   * 获取决策草案的统计信息（需要管理员权限）
   * 
   * ⚠️ 注意：此路由必须放在 :draftId 参数路由之前，否则 'stats' 会被当作 draftId
   */
  @Get('stats')
  @ApiOperation({
    summary: '获取统计信息',
    description: '获取决策草案的统计信息（总数、平均决策数、平均生成时间等）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '统计信息获取成功' })
  async getStats(@Query('workflow_id') workflowId?: string): Promise<{
    total_drafts: number;
    avg_decision_count: number;
    avg_generation_time_ms: number;
  }> {
    this.logger.log(`[DecisionDraftController] 获取统计信息: workflow_id=${workflowId || 'all'}`);

    // TODO: 从数据库查询统计信息
    return {
      total_drafts: 0,
      avg_decision_count: 0,
      avg_generation_time_ms: 0,
    };
  }

  // ============================================================================
  // 管理后台接口（Admin APIs）
  // ============================================================================

  /**
   * 🆕 [Admin] 决策草案分页列表
   * 
   * 管理后台专用：获取所有决策草案的分页列表，支持筛选和排序
   */
  @Get('admin/list')
  @ApiOperation({
    summary: '[Admin] 决策草案分页列表',
    description: '管理后台专用：获取所有决策草案，支持分页、筛选、排序',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量，默认 20，最大 100' })
  @ApiQuery({ name: 'status', required: false, type: String, description: '状态筛选: draft, completed, failed' })
  @ApiQuery({ name: 'destination', required: false, type: String, description: '目的地筛选' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: '创建时间起始（ISO格式）' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: '创建时间结束（ISO格式）' })
  @ApiQuery({ name: 'sortBy', required: false, type: String, description: '排序字段: created_at, updated_at, step_count' })
  @ApiQuery({ name: 'sortOrder', required: false, type: String, description: '排序方向: asc, desc' })
  @ApiResponse({ status: 200, description: '分页列表获取成功' })
  async adminListDecisionDrafts(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: string,
    @Query('destination') destination?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ): Promise<{
    items: Array<{
      draft_id: string;
      trip_id?: string;
      plan_id?: string;
      destination?: string;
      status: string;
      step_count: number;
      user_mode: string;
      created_at: string;
      updated_at?: string;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    filters: {
      status?: string;
      destination?: string;
      dateRange?: { start: string; end: string };
    };
  }> {
    this.logger.log(`[DecisionDraftController] [Admin] 获取决策草案列表: page=${page}, pageSize=${pageSize}`);

    const currentPage = Math.max(1, page || 1);
    const size = Math.min(100, Math.max(1, pageSize || 20));

    // 从存储服务获取分页数据
    const result = await this.storageService.listDecisionDrafts({
      page: currentPage,
      pageSize: size,
      status,
      destination,
      startDate,
      endDate,
      sortBy: sortBy || 'created_at',
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc',
    });

    return {
      items: result.items.map(draft => {
        const metadata = draft.metadata as any;
        return {
          draft_id: draft.draft_id,
          trip_id: draft.trip_id,
          plan_id: draft.plan_id,
          destination: metadata?.destination,
          status: metadata?.status || 'draft',
          step_count: draft.decision_steps?.length || 0,
          user_mode: draft.user_mode,
          created_at: metadata?.created_at || new Date().toISOString(),
          updated_at: metadata?.updated_at,
        };
      }),
      pagination: {
        page: currentPage,
        pageSize: size,
        total: result.total,
        totalPages: Math.ceil(result.total / size),
      },
      filters: {
        status,
        destination,
        dateRange: startDate || endDate ? { start: startDate || '', end: endDate || '' } : undefined,
      },
    };
  }

  /**
   * 🆕 [Admin] 全局决策质量统计
   * 
   * 管理后台专用：获取全局的决策质量指标，用于 AI 质量监控
   */
  @Get('admin/quality-stats')
  @ApiOperation({
    summary: '[Admin] 全局决策质量统计',
    description: '管理后台专用：获取决策系统的全局质量指标，包括成功率、用户满意度、平均决策时间等',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'timeRange', required: false, type: String, description: '时间范围: today, week, month, all' })
  @ApiQuery({ name: 'destination', required: false, type: String, description: '目的地筛选' })
  @ApiResponse({ status: 200, description: '质量统计获取成功' })
  async adminGetQualityStats(
    @Query('timeRange') timeRange?: string,
    @Query('destination') destination?: string,
  ): Promise<{
    overview: {
      total_decisions: number;
      success_rate: number;
      avg_decision_time_ms: number;
      avg_steps_per_draft: number;
    };
    quality_metrics: {
      user_acceptance_rate: number;
      user_modification_rate: number;
      user_rejection_rate: number;
      avg_user_rating: number;
    };
    decision_types: Array<{
      type: string;
      count: number;
      success_rate: number;
    }>;
    trends: {
      period: string;
      data: Array<{
        date: string;
        total: number;
        success: number;
        failed: number;
      }>;
    };
    top_issues: Array<{
      issue: string;
      count: number;
      percentage: number;
    }>;
  }> {
    this.logger.log(`[DecisionDraftController] [Admin] 获取决策质量统计: timeRange=${timeRange}, destination=${destination}`);

    // 从存储服务获取质量统计
    const stats = await this.storageService.getQualityStats({
      timeRange: timeRange || 'week',
      destination,
    });

    return {
      overview: {
        total_decisions: stats.total_decisions || 0,
        success_rate: stats.success_rate || 0,
        avg_decision_time_ms: stats.avg_decision_time_ms || 0,
        avg_steps_per_draft: stats.avg_steps_per_draft || 0,
      },
      quality_metrics: {
        user_acceptance_rate: stats.user_acceptance_rate || 0,
        user_modification_rate: stats.user_modification_rate || 0,
        user_rejection_rate: stats.user_rejection_rate || 0,
        avg_user_rating: stats.avg_user_rating || 0,
      },
      decision_types: stats.decision_types || [],
      trends: {
        period: timeRange || 'week',
        data: stats.trends || [],
      },
      top_issues: stats.top_issues || [],
    };
  }

  /**
   * 🆕 [Admin] 用户决策风格汇总
   * 
   * 管理后台专用：获取用户决策风格的汇总分析，用于了解用户偏好
   */
  @Get('admin/user-styles')
  @ApiOperation({
    summary: '[Admin] 用户决策风格汇总',
    description: '管理后台专用：获取用户决策风格的汇总分析，包括偏好分布、行为模式等',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页数量，默认 20' })
  @ApiQuery({ name: 'styleType', required: false, type: String, description: '风格类型筛选: adventurous, cautious, balanced' })
  @ApiResponse({ status: 200, description: '用户风格汇总获取成功' })
  async adminGetUserStyles(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('styleType') styleType?: string,
  ): Promise<{
    summary: {
      total_users_analyzed: number;
      style_distribution: Array<{
        style: string;
        count: number;
        percentage: number;
      }>;
      avg_decision_confidence: number;
    };
    users: Array<{
      user_id: string;
      style_type: string;
      decision_count: number;
      acceptance_rate: number;
      avg_modification_count: number;
      top_preferences: string[];
      last_active: string;
    }>;
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
    behavior_patterns: Array<{
      pattern: string;
      description: string;
      user_count: number;
      examples: string[];
    }>;
  }> {
    this.logger.log(`[DecisionDraftController] [Admin] 获取用户决策风格汇总: page=${page}, styleType=${styleType}`);

    const currentPage = Math.max(1, page || 1);
    const size = Math.min(100, Math.max(1, pageSize || 20));

    // 从存储服务获取用户风格数据
    const result = await this.storageService.getUserStylesSummary({
      page: currentPage,
      pageSize: size,
      styleType,
    });

    return {
      summary: {
        total_users_analyzed: result.total_users || 0,
        style_distribution: result.style_distribution || [
          { style: 'adventurous', count: 0, percentage: 0 },
          { style: 'cautious', count: 0, percentage: 0 },
          { style: 'balanced', count: 0, percentage: 0 },
        ],
        avg_decision_confidence: result.avg_confidence || 0,
      },
      users: result.users || [],
      pagination: {
        page: currentPage,
        pageSize: size,
        total: result.total_users || 0,
        totalPages: Math.ceil((result.total_users || 0) / size),
      },
      behavior_patterns: result.behavior_patterns || [],
    };
  }

  /**
   * 🆕 [Admin] 决策异常监控
   * 
   * 管理后台专用：获取决策异常和错误的监控数据
   */
  @Get('admin/anomalies')
  @ApiOperation({
    summary: '[Admin] 决策异常监控',
    description: '管理后台专用：获取决策过程中的异常、错误和警告信息',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'severity', required: false, type: String, description: '严重程度: error, warning, info' })
  @ApiQuery({ name: 'timeRange', required: false, type: String, description: '时间范围: hour, day, week' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量，默认 50' })
  @ApiResponse({ status: 200, description: '异常监控数据获取成功' })
  async adminGetAnomalies(
    @Query('severity') severity?: string,
    @Query('timeRange') timeRange?: string,
    @Query('limit') limit?: number,
  ): Promise<{
    summary: {
      total_anomalies: number;
      errors: number;
      warnings: number;
      infos: number;
    };
    anomalies: Array<{
      id: string;
      severity: 'error' | 'warning' | 'info';
      type: string;
      message: string;
      draft_id?: string;
      trip_id?: string;
      user_id?: string;
      timestamp: string;
      context?: Record<string, any>;
      resolved: boolean;
    }>;
    trending_issues: Array<{
      type: string;
      count: number;
      trend: 'increasing' | 'stable' | 'decreasing';
    }>;
  }> {
    this.logger.log(`[DecisionDraftController] [Admin] 获取决策异常监控: severity=${severity}, timeRange=${timeRange}`);

    const maxLimit = Math.min(200, Math.max(1, limit || 50));

    // 从存储服务获取异常数据
    const result = await this.storageService.getAnomalies({
      severity,
      timeRange: timeRange || 'day',
      limit: maxLimit,
    });

    return {
      summary: {
        total_anomalies: result.total || 0,
        errors: result.errors || 0,
        warnings: result.warnings || 0,
        infos: result.infos || 0,
      },
      anomalies: result.anomalies || [],
      trending_issues: result.trending_issues || [],
    };
  }

  /**
   * 获取决策草案
   * 
   * 用户端接口：只读，返回决策草案（根据用户模式返回 ToC 或 Expert 视图）
   */
  @Get(':draftId')
  @ApiOperation({
    summary: '获取决策草案',
    description: '根据用户模式返回决策草案（ToC 模式只显示业务层，Expert 模式显示完整双层结构）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '决策草案获取成功' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  // @Public() // TODO: 临时开放测试，生产环境应移除
  async getDecisionDraft(@Param('draftId') draftId: string): Promise<{
    draft_id: string;
    decision_steps: any[]; // DecisionStep[]
    // ToC 模式不返回 step_draft，Expert 模式返回
    step_draft?: any; // TripNARAWorkflowDraft
    user_mode: 'toc' | 'expert';
    metadata: any;
  }> {
    this.logger.log(`[DecisionDraftController] 获取决策草案: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    // 根据用户模式决定是否返回 step_draft 和 debug_info
    const response: any = {
      draft_id: decisionDraft.draft_id,
      decision_steps: decisionDraft.decision_steps,
      user_mode: decisionDraft.user_mode,
      metadata: decisionDraft.metadata,
    };

    // Expert 和 Studio 模式返回 step_draft
    if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
      response.step_draft = decisionDraft.step_draft;
    }

    // Studio 模式返回 debug_info
    if (decisionDraft.user_mode === 'studio') {
      response.debug_info = decisionDraft.debug_info;
    }

    return response;
  }

  /**
   * 获取决策解释
   * 
   * 用户端接口：提供 ToC 模式（轻解释）或 Expert 模式（完整解释）
   */
  @Get(':draftId/explanation')
  @ApiOperation({
    summary: '获取决策解释',
    description: '根据模式返回决策解释（ToC 模式：轻解释，Expert 模式：完整解释，Studio 模式：完整技术解释，需要 Studio 权限）',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'mode', enum: ['toc', 'expert', 'studio'], required: false, description: '解释模式' })
  @ApiResponse({ status: 200, description: '决策解释获取成功' })
  @ApiResponse({ status: 403, description: 'Studio 模式需要 Studio 权限' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  // @Public() // TODO: 临时开放测试
  async getExplanation(
    @Param('draftId') draftId: string,
    @Query() query: GetExplanationQueryDto,
    @CurrentUser() user?: any,
  ): Promise<any> {
    this.logger.log(
      `[DecisionDraftController] 获取决策解释: draft_id=${draftId}, mode=${query.mode || 'toc'}`,
    );

    const mode = query.mode || 'toc';

    // 检查 Studio 模式权限
    if (mode === 'studio') {
      if (!user) {
        throw new ForbiddenException('需要认证才能访问 Studio 模式');
      }
      const userRoles = user.roles || [];
      const hasStudioPermission =
        userRoles.includes('studio') ||
        userRoles.includes('admin') ||
        userRoles.includes('ops');
      if (!hasStudioPermission) {
        throw new ForbiddenException('需要 Studio 权限才能访问 Studio 模式');
      }
    }

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    return this.explanationService.generateExplanation(decisionDraft, mode);
  }

  /**
   * 获取决策步骤的详细解释
   * 
   * 用户端接口：提供单个决策步骤的完整解释（包括 Step Drafts、证据链、决策日志）
   */
  @Get(':draftId/step/:stepId/explanation')
  @ApiOperation({
    summary: '获取决策步骤解释',
    description: '获取单个决策步骤的详细解释（包括 Step Drafts、证据链、决策日志、三人格评审）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '决策步骤解释获取成功' })
  @ApiResponse({ status: 404, description: '决策草案或步骤不存在' })
  // @Public() // TODO: 临时开放测试
  async getStepExplanation(
    @Param('draftId') draftId: string,
    @Param('stepId') stepId: string,
  ): Promise<any> {
    this.logger.log(
      `[DecisionDraftController] 获取决策步骤解释: draft_id=${draftId}, step_id=${stepId}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    return this.explanationService.generateStepExplanation(decisionDraft, stepId);
  }

  /**
   * 获取版本列表
   * 
   * 用户端接口：查看决策草案的版本历史
   */
  @Get(':draftId/versions')
  @ApiOperation({
    summary: '获取版本列表',
    description: '获取决策草案的所有版本（只返回版本摘要，不返回完整数据）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '版本列表获取成功' })
  // @Public() // TODO: 临时开放测试
  async getVersions(@Param('draftId') draftId: string): Promise<{
    versions: Array<{
      version_id: string;
      version: string;
      created_by: string;
      description?: string;
      created_at: string;
    }>;
  }> {
    this.logger.log(`[DecisionDraftController] 获取版本列表: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
    const versions = await this.versionService.getVersions(workflowId);
    return {
      versions: versions.map((v) => ({
        version_id: v.version_id,
        version: v.version || 'v1.0',
        created_by: v.created_by,
        description: v.description,
        created_at: v.created_at,
      })),
    };
  }

  /**
   * 获取版本详情
   * 
   * 用户端接口：查看特定版本的决策草案
   */
  @Get(':draftId/versions/:versionId')
  @ApiOperation({
    summary: '获取版本详情',
    description: '获取特定版本的决策草案（根据用户模式返回 ToC 或 Expert 视图）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '版本详情获取成功' })
  @ApiResponse({ status: 404, description: '版本不存在' })
  // @Public() // TODO: 临时开放测试
  async getVersion(
    @Param('draftId') draftId: string,
    @Param('versionId') versionId: string,
  ): Promise<any> {
    this.logger.log(
      `[DecisionDraftController] 获取版本详情: draft_id=${draftId}, version_id=${versionId}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
    const version = await this.versionService.getVersion(
      workflowId,
      versionId,
    );
    if (!version) {
      throw new Error(`版本不存在: ${versionId}`);
    }

      // 根据用户模式返回不同详细程度的数据
    const response: any = {
      version_id: version.version_id,
      version: version.version || 'v1.0',
      decision_draft: {
        ...version.decision_draft,
      },
      created_by: version.created_by,
      description: version.description,
      created_at: version.created_at,
    };

    // Expert 和 Studio 模式返回 step_draft
    if (decisionDraft.user_mode === 'expert' || decisionDraft.user_mode === 'studio') {
      response.decision_draft.step_draft = version.step_draft;
    }

    // Studio 模式返回 debug_info
    if (decisionDraft.user_mode === 'studio' && version.decision_draft.debug_info) {
      response.decision_draft.debug_info = version.decision_draft.debug_info;
    }

    return response;
  }

  /**
   * 对比两个版本
   * 
   * 用户端接口：对比两个版本的差异（决策步骤差异、Step Drafts 差异）
   */
  @Get(':draftId/versions/:versionId1/compare/:versionId2')
  @ApiOperation({
    summary: '对比版本',
    description: '对比两个版本的差异（决策步骤差异、Step Drafts 差异）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '版本对比成功' })
  @ApiResponse({ status: 404, description: '版本不存在' })
  // @Public() // TODO: 临时开放测试
  async compareVersions(
    @Param('draftId') draftId: string,
    @Param('versionId1') versionId1: string,
    @Param('versionId2') versionId2: string,
  ): Promise<any> {
    this.logger.log(
      `[DecisionDraftController] 对比版本: draft_id=${draftId}, version1=${versionId1}, version2=${versionId2}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
    return this.versionService.compareVersions(
      workflowId,
      versionId1,
      versionId2,
    );
  }

  /**
   * 编辑决策步骤（用户端）
   * 
   * 用户端接口：编辑单个决策步骤（接受/拒绝/修改）
   */
  @Put(':draftId/step/:stepId')
  @ApiOperation({
    summary: '编辑决策步骤',
    description: '编辑单个决策步骤（接受/拒绝/修改）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '决策步骤编辑成功' })
  @ApiResponse({ status: 404, description: '决策草案或步骤不存在' })
  // @Public() // TODO: 临时开放测试
  async editDecisionStep(
    @Param('draftId') draftId: string,
    @Param('stepId') stepId: string,
    @Body() dto: EditDecisionStepDto,
  ): Promise<{
    draft: any; // DecisionDraft
  }> {
    this.logger.log(
      `[DecisionDraftController] 编辑决策步骤: draft_id=${draftId}, step_id=${stepId}`,
    );

    // 验证 DTO
    if (!dto.operation) {
      throw new Error('缺少 operation 字段');
    }
    if (!dto.operation.action) {
      throw new Error(`缺少 action 字段，收到: ${JSON.stringify(dto)}`);
    }

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const updatedDraft = await this.editorService.editDecisionStep(decisionDraft, {
      ...dto.operation,
      decision_step_id: stepId,
    });

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);

    return { draft: savedDraft };
  }

  /**
   * 应用决策草案
   * 
   * 将已批准或修改的决策步骤应用到行程
   */
  @Post(':draftId/apply')
  @ApiOperation({
    summary: '应用决策草案',
    description: '将已批准或修改的决策步骤应用到行程',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '决策草案应用成功' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  @ApiResponse({ status: 400, description: '存在未批准的决策步骤' })
  // @Public() // TODO: 临时开放测试
  async applyDecisionDraft(@Param('draftId') draftId: string): Promise<{
    draft: any; // DecisionDraft
    applied: boolean;
    applied_steps: string[];
    skipped_steps: string[];
    applied_at: string;
  }> {
    this.logger.log(`[DecisionDraftController] 应用决策草案: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const applyResult = await this.editorService.applyDecisionDraft(decisionDraft);

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(decisionDraft);

    return {
      draft: savedDraft,
      ...applyResult,
    };
  }

  // ============================================
  // 管理功能（需要相应权限）
  // ============================================

  /**
   * 生成决策草案
   * 
   * 根据用户输入和旅行需求生成决策草案
   */
  @Post('generate')
  @ApiOperation({
    summary: '生成决策草案',
    description: '根据用户输入和旅行需求，生成决策草案（业务层 + 技术层）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '决策草案生成成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  // @Public() // TODO: 临时开放测试
  async generateDecisionDraft(@Body() dto: GenerateDecisionDraftDto): Promise<{
    draft: any; // DecisionDraft
    generation_time_ms: number;
  }> {
    this.logger.log(
      `[DecisionDraftController] 生成决策草案: user_input=${dto.user_input.substring(0, 50)}...`,
    );

    const startTime = Date.now();
    const draft = await this.decisionDraftGenerator.generateDecisionDraft(
      dto.user_input,
      dto.trip_plan_request,
      dto.config,
    );
    const generationTime = Date.now() - startTime;

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(draft);

    return {
      draft: savedDraft,
      generation_time_ms: generationTime,
    };
  }

  /**
   * 批量编辑决策步骤
   * 
   * 批量编辑多个决策步骤（Expert模式及以上）
   */
  @Put(':draftId/steps/batch')
  @ApiOperation({
    summary: '批量编辑决策步骤',
    description: '批量编辑多个决策步骤',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '批量编辑成功' })
  // @Public() // TODO: 临时开放测试
  async batchEditDecisionSteps(
    @Param('draftId') draftId: string,
    @Body() dto: BatchEditDecisionStepsDto,
  ): Promise<{
    draft: any; // DecisionDraft
  }> {
    this.logger.log(
      `[DecisionDraftController] 批量编辑决策步骤: draft_id=${draftId}, count=${dto.operations.length}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const updatedDraft = await this.editorService.batchEditDecisionSteps(
      decisionDraft,
      dto.operations,
    );

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);

    return { draft: savedDraft };
  }

  /**
   * 局部重算
   * 
   * 根据用户的编辑操作，只重新生成受影响的决策步骤和步骤草案
   */
  @Post(':draftId/regenerate')
  @ApiOperation({
    summary: '局部重算',
    description: '根据用户的编辑操作，只重新生成受影响的决策步骤和步骤草案（非全量重生成）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '局部重算成功' })
  // @Public() // TODO: 临时开放测试
  async partialRegenerate(
    @Param('draftId') draftId: string,
    @Body() dto: PartialRegenerateDto,
  ): Promise<{
    draft: any; // DecisionDraft
    regeneration_time_ms: number;
  }> {
    this.logger.log(`[DecisionDraftController] 局部重算: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const startTime = Date.now();
    const updatedDraft = await this.editorService.partialRegenerate(
      decisionDraft,
      dto.config,
    );
    const regenerationTime = Date.now() - startTime;

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);

    return {
      draft: savedDraft,
      regeneration_time_ms: regenerationTime,
    };
  }

  /**
   * 重新排序决策步骤
   * 
   * 重新排序决策步骤
   */
  @Put(':draftId/steps/reorder')
  @ApiOperation({
    summary: '重新排序决策步骤',
    description: '重新排序决策步骤',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '重新排序成功' })
  // @Public() // TODO: 临时开放测试
  async reorderDecisionSteps(
    @Param('draftId') draftId: string,
    @Body() dto: ReorderDecisionStepsDto,
  ): Promise<{
    draft: any; // DecisionDraft
  }> {
    this.logger.log(`[DecisionDraftController] 重新排序决策步骤: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const updatedDraft = await this.editorService.reorderDecisionSteps(
      decisionDraft,
      dto.new_order,
    );

    // 保存到数据库
    const savedDraft = await this.storageService.saveDecisionDraft(updatedDraft);

    return { draft: savedDraft };
  }

  /**
   * 保存版本
   * 
   * 保存当前决策草案为版本
   */
  @Post(':draftId/version')
  @ApiOperation({
    summary: '保存版本',
    description: '保存当前决策草案为版本',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '版本保存成功' })
  // @Public() // TODO: 临时开放测试
  async saveVersion(
    @Param('draftId') draftId: string,
    @Body() dto: SaveVersionDto,
  ): Promise<{
    version_id: string;
    version: string;
    saved_at: string;
  }> {
    this.logger.log(`[DecisionDraftController] 保存版本: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const version = await this.versionService.saveVersion(decisionDraft, {
      creator: dto.creator,
      description: dto.description,
      tags: dto.tags,
    });

    return {
      version_id: version.version_id,
      version: version.version || 'v1.0',
      saved_at: version.created_at,
    };
  }

  /**
   * 回滚版本
   * 
   * 回滚到指定版本
   */
  @Post(':draftId/version/:versionId/rollback')
  @ApiOperation({
    summary: '回滚版本',
    description: '回滚到指定版本',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '版本回滚成功' })
  @ApiResponse({ status: 404, description: '版本不存在' })
  // @Public() // TODO: 临时开放测试
  async rollbackVersion(
    @Param('draftId') draftId: string,
    @Param('versionId') versionId: string,
  ): Promise<{
    version: any; // DecisionDraftVersion
  }> {
    this.logger.log(
      `[DecisionDraftController] 回滚版本: draft_id=${draftId}, version_id=${versionId}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
    const version = await this.versionService.rollbackToVersion(
      workflowId,
      versionId,
    );

    // 保存回滚后的决策草案
    const savedDraft = await this.storageService.saveDecisionDraft(version.decision_draft);

    return { version: { ...version, decision_draft: savedDraft } };
  }

  /**
   * Fork 版本
   * 
   * 基于指定版本创建新分支
   */
  @Post(':draftId/version/:versionId/fork')
  @ApiOperation({
    summary: 'Fork 版本',
    description: '基于指定版本创建新分支（生成新的 workflow_id）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Fork 成功' })
  @ApiResponse({ status: 404, description: '版本不存在' })
  // @Public() // TODO: 临时开放测试
  async forkVersion(
    @Param('draftId') draftId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ForkVersionDto,
  ): Promise<{
    version: any; // DecisionDraftVersion
    new_draft_id: string;
  }> {
    this.logger.log(
      `[DecisionDraftController] Fork 版本: draft_id=${draftId}, version_id=${versionId}, new_workflow_id=${dto.new_workflow_id}`,
    );

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    const workflowId = decisionDraft.workflow_id || decisionDraft.plan_id || draftId;
    const version = await this.versionService.forkVersion(
      workflowId,
      versionId,
      dto.new_workflow_id,
      {
        creator: dto.creator,
        description: dto.description,
      },
    );

    // 保存 Fork 后的决策草案
    const savedDraft = await this.storageService.saveDecisionDraft(version.decision_draft);

    return {
      version: { ...version, decision_draft: savedDraft },
      new_draft_id: savedDraft.draft_id,
    };
  }

  /**
   * 获取调试信息（Studio 模式）
   * 
   * 获取决策草案的完整调试信息（LLM Calls、Skill Calls、性能指标等），需要 Studio 权限
   */
  @Get(':draftId/debug-info')
  @UseGuards(StudioModeGuard)
  @RequireStudio()
  @ApiOperation({
    summary: '获取调试信息',
    description: '获取决策草案的完整调试信息（LLM Calls、Skill Calls、性能指标、执行追踪等），需要 Studio 权限',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '调试信息获取成功' })
  @ApiResponse({ status: 403, description: '需要 Studio 权限' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  // @Public() // TODO: 临时开放测试
  async getDebugInfo(@Param('draftId') draftId: string): Promise<{
    draft_id: string;
    debug_info: any; // DecisionDebugInfo
  }> {
    this.logger.log(`[DecisionDraftController] 获取调试信息: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    // 如果决策草案没有 debug_info，返回空对象
    const debugInfo = decisionDraft.debug_info || {
      llm_calls: [],
      skill_calls: [],
      performance_metrics: undefined,
      execution_trace: undefined,
    };

    return {
      draft_id: decisionDraft.draft_id,
      debug_info: debugInfo,
    };
  }

  /**
   * 预览编辑影响
   * 
   * 预览对决策步骤的编辑会产生什么影响（不实际执行）
   */
  @Post(':draftId/preview-impact')
  @ApiOperation({
    summary: '预览编辑影响',
    description: '预览对决策步骤的编辑会产生什么影响，包括受影响的步骤、预估变更等（不实际执行修改）',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '影响预览成功' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  async previewImpact(
    @Param('draftId') draftId: string,
    @Body() body: {
      step_id: string;
      proposed_changes: {
        action?: 'accept' | 'reject' | 'modify';
        modifications?: Record<string, any>;
      };
    },
  ): Promise<{
    draft_id: string;
    step_id: string;
    impact: {
      affected_steps: string[];
      estimated_changes: Array<{
        step_id: string;
        change_type: 'modified' | 'regenerated' | 'removed';
        description: string;
      }>;
      risk_level: 'low' | 'medium' | 'high';
      warnings: string[];
    };
  }> {
    this.logger.log(`[DecisionDraftController] 预览编辑影响: draft_id=${draftId}, step_id=${body.step_id}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    // 查找目标步骤
    const targetStep = decisionDraft.decision_steps?.find(
      (s: any) => s.id === body.step_id,
    );
    if (!targetStep) {
      throw new Error(`决策步骤不存在: ${body.step_id}`);
    }

    // 分析影响（简化实现）
    const affectedSteps: string[] = [];
    const estimatedChanges: Array<{
      step_id: string;
      change_type: 'modified' | 'regenerated' | 'removed';
      description: string;
    }> = [];
    const warnings: string[] = [];

    // 根据操作类型分析影响
    if (body.proposed_changes.action === 'reject') {
      // 拒绝操作可能影响后续步骤
      const stepIndex = decisionDraft.decision_steps?.findIndex(
        (s: any) => s.id === body.step_id,
      );
      if (stepIndex !== undefined && stepIndex >= 0) {
        const subsequentSteps = decisionDraft.decision_steps?.slice(stepIndex + 1) || [];
        for (const step of subsequentSteps) {
          const stepAny = step as any;
          if (stepAny.dependencies?.includes(body.step_id)) {
            affectedSteps.push(step.id);
            estimatedChanges.push({
              step_id: step.id,
              change_type: 'regenerated',
              description: `依赖被拒绝的步骤，需要重新生成`,
            });
          }
        }
      }
      warnings.push('拒绝此步骤可能导致后续依赖步骤需要重新生成');
    } else if (body.proposed_changes.action === 'modify') {
      estimatedChanges.push({
        step_id: body.step_id,
        change_type: 'modified',
        description: '步骤将按照您的修改进行更新',
      });
    }

    // 计算风险等级
    const riskLevel: 'low' | 'medium' | 'high' =
      affectedSteps.length > 3 ? 'high' :
      affectedSteps.length > 0 ? 'medium' : 'low';

    return {
      draft_id: draftId,
      step_id: body.step_id,
      impact: {
        affected_steps: affectedSteps,
        estimated_changes: estimatedChanges,
        risk_level: riskLevel,
        warnings,
      },
    };
  }

  /**
   * 获取决策回放数据
   *
   * 获取决策草案的回放数据，包括决策时间线、快照和可视化数据
   */
  @Get(':draftId/replay')
  @ApiOperation({
    summary: '获取决策回放数据',
    description: '获取决策草案的回放数据，用于前端决策可视化和回放功能',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: '回放数据获取成功' })
  @ApiResponse({ status: 404, description: '决策草案不存在' })
  async getReplayData(@Param('draftId') draftId: string): Promise<{
    draft_id: string;
    timeline: Array<{
      step_id: string;
      timestamp: string;
      decision_type: string;
      summary: string;
      status: string;
    }>;
    snapshots: Array<{
      snapshot_id: string;
      step_id: string;
      state: any;
      created_at: string;
    }>;
    visualization: {
      nodes: Array<{ id: string; type: string; label: string; data: any }>;
      edges: Array<{ source: string; target: string; label?: string }>;
    };
  }> {
    this.logger.log(`[DecisionDraftController] 获取决策回放数据: draft_id=${draftId}`);

    const decisionDraft = await this.storageService.loadDecisionDraft(draftId);
    if (!decisionDraft) {
      throw new Error(`决策草案不存在: ${draftId}`);
    }

    // 构建时间线
    const timeline = (decisionDraft.decision_steps || []).map((step, index) => ({
      step_id: step.id || `step-${index}`,
      timestamp: decisionDraft.metadata?.created_at || new Date().toISOString(),
      decision_type: step.type || 'unknown',
      summary: step.title || step.description || `步骤 ${index + 1}`,
      status: step.status || 'completed',
    }));

    // 构建快照
    const snapshots = (decisionDraft.decision_steps || []).map((step, index) => ({
      snapshot_id: `snapshot-${step.id || index}`,
      step_id: step.id || `step-${index}`,
      state: {
        inputs: step.inputs || [],
        outputs: step.outputs || [],
        evidence: step.evidence || [],
      },
      created_at: decisionDraft.metadata?.created_at || new Date().toISOString(),
    }));

    // 构建可视化数据（节点和边）
    const nodes = (decisionDraft.decision_steps || []).map((step, index) => ({
      id: step.id || `step-${index}`,
      type: step.type || 'decision',
      label: step.title || `决策 ${index + 1}`,
      data: {
        status: step.status,
        confidence: step.confidence,
        description: step.description,
      },
    }));

    const edges: Array<{ source: string; target: string; label?: string }> = [];
    for (let i = 1; i < nodes.length; i++) {
      edges.push({
        source: nodes[i - 1].id,
        target: nodes[i].id,
        label: `→`,
      });
    }

    return {
      draft_id: decisionDraft.draft_id,
      timeline,
      snapshots,
      visualization: {
        nodes,
        edges,
      },
    };
  }
}
