// src/trips/trips.controller.ts
import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { TripsService } from './trips.service';
import { TripExtendedService } from './services/trip-extended.service';
import { TripRecapService } from './services/trip-recap.service';
import { TripEmergencyService, EmergencySOSRequest } from './services/trip-emergency.service';
import { TripBudgetService } from './services/trip-budget.service';
import { TripAdjustmentService, TripModificationRequest } from './services/trip-adjustment.service';
import { LlmService } from '../llm/services/llm.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { CreateTripFromNaturalLanguageDto } from './dto/create-trip-from-nl.dto';
import { TripStateDto } from './dto/trip-state.dto';
import { ScheduleResponseDto, SaveScheduleDto } from './dto/schedule.dto';
import { CreateTripShareDto } from './dto/trip-share.dto';
import { AddCollaboratorDto } from './dto/trip-collaborator.dto';
import { DeleteTripDto } from './dto/delete-trip.dto';
import { PersonaAlertDto } from './dto/persona-alerts.dto';
import { DecisionLogResponseDto } from './dto/decision-log.dto';
import { TaskDto, UpdateTaskStatusDto } from './dto/tasks.dto';
import { PipelineStatusResponseDto } from './dto/pipeline-status.dto';
import { CreateTripDraftDto, TripDraftResponseDto, SaveTripDraftDto, ReplaceItineraryItemDto, ReplaceItineraryItemResponseDto, RegenerateTripDto, RegenerateTripResponseDto } from './dto/trip-draft.dto';
import { TripDraftService } from './services/trip-draft.service';
import { GetEvidenceQueryDto, EvidenceListResponseDto } from './dto/evidence.dto';
import { GetAttentionQueueQueryDto, AttentionQueueResponseDto } from './dto/attention-queue.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { DayMetricsResponseDto, TripMetricsResponseDto } from './dto/trip-metrics.dto';
import { ConflictsResponseDto, ConflictSeverity } from './dto/trip-conflicts.dto';
import { UpdateIntentRequestDto, UpdateIntentResponseDto, IntentResponseDto } from './dto/trip-intent.dto';
import { ApplyOptimizationRequestDto, ApplyOptimizationResponseDto } from './dto/trip-optimization.dto';
import { BatchUpdateItemsRequestDto, BatchUpdateItemsResponseDto } from './dto/trip-items.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripMetricsService } from './services/trip-metrics.service';
import { TripConflictsService } from './services/trip-conflicts.service';
import { TripIntentService } from './services/trip-intent.service';
import { TripOptimizationService } from './services/trip-optimization.service';
import { TripSuggestionsService } from './services/trip-suggestions.service';
import { 
  SuggestionListResponseDto, 
  SuggestionStatsDto,
  SuggestionPersona,
  SuggestionScope,
  SuggestionSeverity,
  SuggestionStatus,
  ApplySuggestionRequestDto,
  ApplySuggestionResponseDto
} from './dto/suggestions.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);

  constructor(
    private readonly tripsService: TripsService,
    private readonly tripExtendedService: TripExtendedService,
    private readonly tripRecapService: TripRecapService,
    private readonly tripEmergencyService: TripEmergencyService,
    private readonly tripBudgetService: TripBudgetService,
    private readonly tripAdjustmentService: TripAdjustmentService,
    private readonly tripDraftService: TripDraftService,
    private readonly llmService: LlmService,
    private readonly tripMetricsService: TripMetricsService,
    private readonly tripConflictsService: TripConflictsService,
    private readonly tripIntentService: TripIntentService,
    private readonly tripOptimizationService: TripOptimizationService,
    private readonly tripSuggestionsService: TripSuggestionsService,
    private readonly prisma: PrismaService
  ) {}

  @Post()
  @ApiOperation({ 
    summary: '创建新行程',
    description: '创建新行程并自动计算节奏策略（木桶效应）和预算切分。系统会根据旅行者信息自动计算体力限制和地形限制，并根据预算推荐酒店档次。也可以从草案创建行程（传入 SaveTripDraftDto）。'
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程创建成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '输入数据验证失败（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async create(
    @Body() body: CreateTripDto | SaveTripDraftDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
      }
      
      // 检查是否是草案保存请求（包含 draft 字段）
      if ('draft' in body) {
        const trip = await this.tripsService.createFromDraft(body as SaveTripDraftDto, userId);
        return successResponse(trip);
      } else {
        const trip = await this.tripsService.create(body as CreateTripDto, userId);
        return successResponse(trip);
      }
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Post('from-natural-language')
  @ApiOperation({
    summary: '自然语言创建行程',
    description: '使用自然语言描述创建行程，大模型会自动解析需求并转换为接口参数。例如："帮我规划带娃去东京5天的行程，预算2万"',
  })
  @ApiBody({ type: CreateTripFromNaturalLanguageDto })
  @ApiResponse({
    status: 200,
    description: '成功创建行程或需要澄清（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createFromNaturalLanguage(
    @Body() dto: CreateTripFromNaturalLanguageDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      if (!userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '需要登录才能创建行程');
      }

      // 使用 LLM 解析自然语言
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: dto.text,
        provider: dto.llmProvider,
      });

      // 如果需要澄清，返回澄清问题
      this.logger.debug(`Parse result needsClarification: ${parseResult.needsClarification}`);
      if (parseResult.needsClarification) {
        this.logger.debug(`Returning clarification questions: ${JSON.stringify(parseResult.clarificationQuestions)}`);
        return successResponse({
          needsClarification: true,
          clarificationQuestions: parseResult.clarificationQuestions,
          partialParams: parseResult.params,
        });
      }

      // 转换为 CreateTripDto
      const travelers: Array<{ type: 'ADULT' | 'ELDERLY' | 'CHILD'; mobilityTag: MobilityTag }> = [];
      
      if (parseResult.params.hasChildren) {
        travelers.push({ type: 'CHILD', mobilityTag: MobilityTag.CITY_POTATO });
      }
      if (parseResult.params.hasElderly) {
        travelers.push({ type: 'ELDERLY', mobilityTag: MobilityTag.ACTIVE_SENIOR });
      }
      // 默认至少一个成人
      if (travelers.length === 0 || !travelers.some(t => t.type === 'ADULT' && t.mobilityTag !== MobilityTag.LIMITED)) {
        travelers.push({ type: 'ADULT', mobilityTag: MobilityTag.CITY_POTATO });
      }

      // 确保日期格式正确（YYYY-MM-DD）
      let startDate = parseResult.params.startDate;
      let endDate = parseResult.params.endDate;
      
      // 如果是 ISO 格式，转换为日期格式
      if (startDate && startDate.includes('T')) {
        startDate = startDate.split('T')[0];
      }
      if (endDate && endDate.includes('T')) {
        endDate = endDate.split('T')[0];
      }

      this.logger.debug(`Creating trip with params: ${JSON.stringify({ destination: parseResult.params.destination, startDate, endDate, totalBudget: parseResult.params.totalBudget, travelersCount: travelers.length })}`);

      const createTripDto: CreateTripDto = {
        destination: parseResult.params.destination,
        startDate: startDate,
        endDate: endDate,
        totalBudget: parseResult.params.totalBudget,
        travelers: travelers as any,
      };

      // 创建行程
      const trip = await this.tripsService.create(createTripDto, userId);
      
      // 异步生成行程规划点（不阻塞响应）
      // 计算行程天数
      const start = DateTime.fromISO(startDate);
      const end = DateTime.fromISO(endDate);
      const durationDays = Math.floor(end.diff(start, 'days').days) + 1;
      
      // 在后台异步生成规划点，不等待完成
      this.generateDraftAsync(trip.id, {
        destination: parseResult.params.destination,
        days: durationDays,
        startDate: startDate,
        endDate: endDate,
        style: parseResult.params.preferences?.style || 'balanced',
        intensity: parseResult.params.preferences?.intensity || 'balanced',
      }).catch((error: any) => {
        this.logger.error(`后台生成行程规划点失败 (tripId: ${trip.id}): ${error.message}`, error.stack);
      });
      
      // 立即返回行程（不包含规划点，规划点会在后台生成）
      return successResponse({
        trip,
        parsedParams: parseResult.params,
        generatingItems: true, // 标记正在生成规划点
        message: '行程已创建，正在后台生成行程规划点，请稍后刷新查看',
      });
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      this.logger.error(`Failed to create trip from natural language: ${errorMessage}`, error?.stack);
      
      // 尝试使用 LLM 处理错误并生成友好的错误信息
      try {
        const errorHandling = await this.llmService.handleErrorAndClarify(error, `创建行程: ${dto.text}`);
        const message = errorHandling?.message || errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确。';
        const details = {
          clarificationQuestions: errorHandling?.clarificationQuestions || ['请提供更详细的行程信息'],
          suggestedActions: errorHandling?.suggestedActions || ['重试', '联系客服'],
          originalError: errorMessage,
        };
        this.logger.debug(`Error handling response: ${JSON.stringify({ message, details })}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, message, details);
      } catch (llmError: any) {
        // 如果 LLM 错误处理也失败，返回默认错误信息
        this.logger.warn(`LLM error handling failed: ${llmError?.message || llmError}`);
        const defaultMessage = errorMessage || '处理您的请求时遇到了问题。请检查输入参数是否正确，或稍后重试。';
        const defaultDetails = {
          originalError: errorMessage,
          errorType: error?.constructor?.name || 'Error',
          clarificationQuestions: ['请提供更详细的行程信息（目的地、日期、预算等）'],
          suggestedActions: ['重试', '使用标准创建行程接口'],
        };
        this.logger.debug(`Default error response: ${JSON.stringify({ message: defaultMessage, details: defaultDetails })}`);
        return errorResponse(ErrorCode.BUSINESS_ERROR, defaultMessage, defaultDetails);
      }
    }
  }

  @Get()
  @ApiOperation({ 
    summary: '获取所有行程',
    description: '返回所有行程列表，包含每个行程的基本信息和关联的 TripDay'
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async findAll(@CurrentUser() user?: CurrentUserPayload) {
    const userId = user?.userId;
    const trips = await this.tripsService.findAll(userId);
    return successResponse(trips);
  }

  @Get(':id')
  @ApiOperation({ 
    summary: '获取单个行程详情（全景视图）',
    description: '根据行程 ID 获取完整的行程树形结构，包括：\n' +
                 '- 所有 TripDay（按日期排序）\n' +
                 '- 每个 Day 下的所有 ItineraryItem（按时间排序）\n' +
                 '- 每个 Item 关联的 Place 详情（包含中英文名称、位置、营业时间等）\n' +
                 '- 统计信息（总天数、总活动数、行程状态等）'
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回行程详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    try {
      const userId = user?.userId;
      const trip = await this.tripsService.findOne(id, userId);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @ApiOperation({
    summary: '更新行程基本信息',
    description: '更新行程的基本信息，包括目的地、日期、预算、旅行者等。支持部分更新（只更新提供的字段）。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({ type: UpdateTripDto })
  @ApiResponse({
    status: 200,
    description: '更新成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async update(@Param('id') id: string, @Body() dto: UpdateTripDto) {
    try {
      const trip = await this.tripsService.update(id, dto);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`更新行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除行程',
    description: '删除指定的行程及其所有关联数据，包括：\n' +
                 '- 所有行程日期（TripDay）\n' +
                 '- 所有行程项（ItineraryItem）\n' +
                 '- 所有协作者（TripCollaborator）\n' +
                 '- 所有收藏（TripCollection）\n' +
                 '- 所有点赞（TripLike）\n' +
                 '- 所有分享（TripShare）\n\n' +
                 '**安全确认**：为防止误删，需要输入目的地国家代码（如：JP、IS）来确认删除。\n\n' +
                 '**警告**：此操作不可恢复，请谨慎使用。'
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({ type: DeleteTripDto })
  @ApiResponse({
    status: 200,
    description: '删除成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 200,
    description: '行程不存在或确认文字不匹配（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async remove(@Param('id') id: string, @Body() dto: DeleteTripDto) {
    try {
      const result = await this.tripsService.remove(id, dto.confirmText);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Get(':id/state')
  @ApiOperation({
    summary: '获取行程当前状态',
    description: '返回行程的当前状态，包括当前日期、当前行程项、下一站信息等。用于语音问"下一站"和按钮操作。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'now', description: '当前时间（ISO 格式，可选）', example: '2024-05-01T10:30:00.000Z', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回行程当前状态',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getTripState(
    @Param('id') id: string,
    @Query('now') nowISO?: string,
  ) {
    try {
      const state = await this.tripsService.getTripState(id, nowISO);
      return successResponse(state);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':id/schedule')
  @ApiOperation({
    summary: '获取指定日期的 Schedule',
    description: '从数据库读取指定日期的 Schedule（DayScheduleResult 格式）。如果该日期没有 Schedule，返回 null。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true })
  @ApiResponse({
    status: 200,
    description: '成功返回 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getSchedule(
    @Param('id') id: string,
    @Query('date') dateISO: string,
  ) {
    try {
      const result = await this.tripsService.getSchedule(id, dateISO);
      return successResponse(result);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Put(':id/schedule')
  @ApiOperation({
    summary: '保存指定日期的 Schedule',
    description: '将 Schedule（DayScheduleResult）保存到数据库，转换为 ItineraryItem。用于保存 apply-action、what-if apply 后的新 schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD）', example: '2024-05-01', required: true })
  @ApiResponse({
    status: 200,
    description: '成功保存 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async saveSchedule(
    @Param('id') id: string,
    @Query('date') dateISO: string,
    @Body() body: SaveScheduleDto,
  ) {
    try {
      const result = await this.tripsService.saveSchedule(id, dateISO, body.schedule);
      return successResponse(result);
    } catch (error: any) {
      if (error.status === 404) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Get(':id/actions')
  @ApiOperation({
    summary: '获取操作历史',
    description: '获取行程的操作历史记录，支持按日期筛选。用于审计回放和撤销功能。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiQuery({ name: 'date', description: '日期（YYYY-MM-DD，可选）', example: '2024-05-01', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回操作历史列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getActionHistory(
    @Param('id') id: string,
    @Query('date') dateISO?: string,
  ) {
    try {
      const history = await this.tripsService.getActionHistory(id, dateISO);
      return successResponse(history);
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/actions/undo')
  @ApiOperation({
    summary: '撤销操作',
    description: '撤销最后一次操作，返回操作前的 Schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（YYYY-MM-DD）',
          example: '2024-05-01',
        },
      },
      required: ['date'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回撤销后的 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在或没有可撤销的操作' })
  async undoAction(
    @Param('id') id: string,
    @Body() body: { date: string },
  ) {
    try {
      const schedule = await this.tripsService.undoAction(id, body.date);
      if (!schedule) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, '没有可撤销的操作');
      }
      return successResponse({ schedule });
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/actions/redo')
  @ApiOperation({
    summary: '重做操作',
    description: '重做最后一次撤销的操作，返回操作后的 Schedule。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)', example: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: '日期（YYYY-MM-DD）',
          example: '2024-05-01',
        },
      },
      required: ['date'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回重做后的 Schedule',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ status: 404, description: '行程不存在或没有可重做的操作' })
  async redoAction(
    @Param('id') id: string,
    @Body() body: { date: string },
  ) {
    try {
      const schedule = await this.tripsService.redoAction(id, body.date);
      if (!schedule) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, '没有可重做的操作');
      }
      return successResponse({ schedule });
    } catch (error: any) {
      if (error.message?.includes('不存在')) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      throw error;
    }
  }

  @Post(':id/share')
  @ApiOperation({
    summary: '生成行程分享链接',
    description: '生成行程分享链接/二维码，设置查看/编辑权限。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: CreateTripShareDto })
  @ApiResponse({
    status: 200,
    description: '成功生成分享链接（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createShare(
    @Param('id') id: string,
    @Body() dto: CreateTripShareDto
  ) {
    try {
      const share = await this.tripExtendedService.createShare(id, dto);
      return successResponse(share);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/collaborators')
  @ApiOperation({
    summary: '添加行程协作者',
    description: '通过邮箱添加行程协作者，设置查看/编辑权限。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: AddCollaboratorDto })
  @ApiResponse({
    status: 200,
    description: '成功添加协作者（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async addCollaborator(
    @Param('id') id: string,
    @Body() dto: AddCollaboratorDto
  ) {
    try {
      const collaborator = await this.tripExtendedService.addCollaborator(id, dto);
      return successResponse(collaborator);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.BUSINESS_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/collaborators')
  @ApiOperation({
    summary: '获取协作者列表',
    description: '获取行程的所有协作者列表。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回协作者列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getCollaborators(@Param('id') id: string) {
    try {
      const collaborators = await this.tripExtendedService.getCollaborators(id);
      return successResponse(collaborators);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/collaborators/:userId')
  @ApiOperation({
    summary: '移除协作者',
    description: '移除行程的指定协作者。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({
    status: 200,
    description: '成功移除协作者（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async removeCollaborator(
    @Param('id') id: string,
    @Param('userId') userId: string
  ) {
    try {
      const result = await this.tripExtendedService.removeCollaborator(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/collect')
  @ApiOperation({
    summary: '收藏行程',
    description: '收藏行程，用于后续参考。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功收藏行程（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async collectTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.collectTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/collect')
  @ApiOperation({
    summary: '取消收藏行程',
    description: '取消收藏行程。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功取消收藏（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async uncollectTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.uncollectTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/like')
  @ApiOperation({
    summary: '点赞行程',
    description: '点赞行程，用于热门行程推荐。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功点赞行程（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async likeTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.likeTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Delete(':id/like')
  @ApiOperation({
    summary: '取消点赞行程',
    description: '取消点赞行程。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功取消点赞（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async unlikeTrip(@Param('id') id: string) {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const result = await this.tripExtendedService.unlikeTrip(id, userId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('featured')
  @ApiOperation({
    summary: '获取热门推荐行程',
    description: '根据点赞数和收藏数获取热门推荐行程列表。',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回数量限制', example: 10 })
  @ApiResponse({
    status: 200,
    description: '成功返回热门行程列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getFeaturedTrips(@Query('limit') limit?: number) {
    try {
      const trips = await this.tripExtendedService.getFeaturedTrips(limit ? parseInt(limit.toString()) : 10);
      return successResponse(trips);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/offline-pack')
  @ApiOperation({
    summary: '导出行程离线数据包',
    description: '导出行程离线数据包（包含地点详情、路线、Schedule），用于离线查看和编辑。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功导出离线数据包（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async exportOfflinePack(@Param('id') id: string) {
    try {
      const pack = await this.tripExtendedService.exportOfflinePack(id);
      return successResponse(pack);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/offline-status')
  @ApiOperation({
    summary: '查询离线数据包状态',
    description: '查询行程的离线数据包是否存在及其版本信息。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回离线数据包状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getOfflinePackStatus(@Param('id') id: string) {
    try {
      const status = await this.tripExtendedService.getOfflinePackStatus(id);
      return successResponse(status);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/offline-sync')
  @ApiOperation({
    summary: '同步离线修改',
    description: '联网后同步离线修改的内容。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      description: '离线数据',
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功同步离线数据（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async syncOfflineChanges(
    @Param('id') id: string,
    @Body() offlineData: any
  ) {
    try {
      const result = await this.tripExtendedService.syncOfflineChanges(id, offlineData);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/recap')
  @ApiOperation({ 
    summary: '生成行程复盘报告',
    description: '生成包含景点打卡顺序、徒步总里程、海拔变化等数据的完整复盘报告'
  })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateRecap(@Param('id') id: string) {
    try {
      const recap = await this.tripRecapService.generateRecap(id);
      return successResponse(recap);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/recap/export')
  @ApiOperation({ 
    summary: '导出行程复盘报告（用于分享）',
    description: '导出为可分享的格式，包含完整的景点和徒步轨迹数据'
  })
  @ApiResponse({ status: 200, description: '导出成功' })
  async exportRecap(@Param('id') id: string) {
    try {
      const exportData = await this.tripRecapService.exportForSharing(id);
      return successResponse(exportData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/trail-video-data')
  @ApiOperation({ 
    summary: '生成3D轨迹视频数据',
    description: '返回GPX和关键点信息，前端可据此生成3D轨迹视频'
  })
  @ApiResponse({ status: 200, description: '生成成功' })
  async generateTrailVideoData(@Param('id') id: string) {
    try {
      const videoData = await this.tripRecapService.generateTrailVideoData(id);
      return successResponse(videoData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get('shared/:shareToken')
  @ApiOperation({ 
    summary: '根据分享令牌获取行程',
    description: '获取分享的行程数据，包括所有Trail信息、行程项、景点等完整数据。可用于预览分享的行程。'
  })
  @ApiParam({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({ status: 200, description: '获取成功，返回完整的行程数据（包括Trail）' })
  @ApiResponse({ status: 404, description: '分享链接不存在或已失效' })
  @ApiResponse({ status: 400, description: '分享链接已过期' })
  async getTripByShareToken(@Param('shareToken') shareToken: string) {
    try {
      const tripData = await this.tripExtendedService.getTripByShareToken(shareToken);
      return successResponse(tripData);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('shared/:shareToken/import')
  @ApiOperation({ 
    summary: '导入分享的行程',
    description: '从分享链接导入行程，包括所有Trail数据，创建新的行程副本。会完整复制所有行程项、Trail关联、GPX数据等。'
  })
  @ApiParam({ name: 'shareToken', description: '分享令牌', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({
    description: '导入行程请求',
    schema: {
      type: 'object',
      required: ['destination', 'startDate', 'endDate'],
      properties: {
        destination: { type: 'string', description: '目的地', example: '武功山' },
        startDate: { type: 'string', description: '开始日期（ISO 8601）', example: '2024-05-01' },
        endDate: { type: 'string', description: '结束日期（ISO 8601）', example: '2024-05-03' },
        userId: { type: 'string', description: '用户ID（可选）', example: 'user123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '导入成功，返回新创建的行程ID' })
  @ApiResponse({ status: 404, description: '分享链接不存在或已失效' })
  @ApiResponse({ status: 400, description: '分享链接已过期或数据验证失败' })
  async importTripFromShare(
    @Param('shareToken') shareToken: string,
    @Body() body: {
      destination: string;
      startDate: string;
      endDate: string;
      userId?: string;
    }
  ) {
    try {
      const result = await this.tripExtendedService.importTripFromShare(shareToken, body);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/emergency/sos')
  @ApiOperation({
    summary: '发送紧急求救信号',
    description: '在行程中遇到危险时一键发送求救信号，包含精准经纬度和行程相关背景',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['latitude', 'longitude'],
      properties: {
        latitude: { type: 'number', description: '纬度', example: 64.1283 },
        longitude: { type: 'number', description: '经度', example: -21.8278 },
        message: { type: 'string', description: '求救消息（可选）', example: '迷路，需要救援' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '求救信号发送成功',
    type: ApiSuccessResponseDto,
  })
  async sendEmergencySOS(
    @Param('id') id: string,
    @Body() body: { latitude: number; longitude: number; message?: string }
  ) {
    try {
      const request: EmergencySOSRequest = {
        tripId: id,
        latitude: body.latitude,
        longitude: body.longitude,
        message: body.message,
      };
      const response = await this.tripEmergencyService.sendSOS(request);
      return successResponse(response);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/emergency/history')
  @ApiOperation({
    summary: '获取求救记录',
    description: '获取行程的所有求救记录',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回求救记录列表',
    type: ApiSuccessResponseDto,
  })
  async getSOSHistory(@Param('id') id: string) {
    try {
      const history = await this.tripEmergencyService.getSOSHistory(id);
      return successResponse(history);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/summary')
  @ApiOperation({
    summary: '获取行程预算摘要',
    description: '实时查看行程消费和预算情况，包含各类消费明细分类',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回预算摘要',
    type: ApiSuccessResponseDto,
  })
  async getBudgetSummary(@Param('id') id: string) {
    try {
      const summary = await this.tripBudgetService.getBudgetSummary(id);
      return successResponse(summary);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/alert')
  @ApiOperation({
    summary: '检查预算预警',
    description: '添加新活动前检查是否会触发预算预警',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'cost', description: '新增项的成本', type: Number, required: true })
  @ApiResponse({
    status: 200,
    description: '返回预算预警（如果有）',
    type: ApiSuccessResponseDto,
  })
  async checkBudgetAlert(
    @Param('id') id: string,
    @Query('cost') cost: string
  ) {
    try {
      const alert = await this.tripBudgetService.checkBudgetAlert(id, parseFloat(cost));
      return successResponse(alert);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/optimization')
  @ApiOperation({
    summary: '获取预算优化建议',
    description: '提供合理的预算优化建议，包括替换、移除、调整等方案',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'category', description: '消费类别（可选）', required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回优化建议',
    type: ApiSuccessResponseDto,
  })
  async getBudgetOptimization(
    @Param('id') id: string,
    @Query('category') category?: string
  ) {
    try {
      const suggestions = await this.tripBudgetService.getBudgetOptimizationSuggestions(id, category);
      return successResponse(suggestions);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/budget/report')
  @ApiOperation({
    summary: '生成预算执行分析报告',
    description: '行程结束后生成预算执行分析报告，包含消费趋势和优化建议',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功生成预算报告',
    type: ApiSuccessResponseDto,
  })
  async generateBudgetReport(@Param('id') id: string) {
    try {
      const report = await this.tripBudgetService.generateBudgetReport(id);
      return successResponse(report);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/adjust')
  @ApiOperation({
    summary: '修改行程并自动适配调整',
    description: '修改行程中的日期或活动安排，系统自动触发节奏修复机制，调整关联服务并更新预算',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['modifications'],
      properties: {
        modifications: {
          type: 'array',
          description: '修改列表',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['CHANGE_DATE', 'MOVE_ACTIVITY', 'ADD_ACTIVITY', 'REMOVE_ACTIVITY', 'ADD_BUFFERS'],
              },
              options: {
                type: 'object',
                description: '选项（用于 ADD_BUFFERS）',
                properties: {
                  bufferDuration: { type: 'number', description: '缓冲时长（分钟），默认 30' },
                  applyToAllDays: { type: 'boolean', description: '是否应用到所有日期，默认 false' },
                  dayId: { type: 'string', description: '如果 applyToAllDays 为 false，指定日期 ID' },
                },
              },
              itemId: { type: 'string', description: '行程项 ID（修改/删除时必填）' },
              newDate: { type: 'string', description: '新日期（YYYY-MM-DD）' },
              newStartTime: { type: 'string', description: '新开始时间（HH:mm）' },
              activityData: { type: 'object', description: '活动数据（添加时必填）' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '行程调整成功',
    type: ApiSuccessResponseDto,
  })
  async adjustTrip(
    @Param('id') id: string,
    @Body() body: { modifications: TripModificationRequest['modifications'] }
  ) {
    try {
      const request: TripModificationRequest = {
        tripId: id,
        modifications: body.modifications,
      };
      const result = await this.tripAdjustmentService.adjustTrip(request);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/persona-alerts')
  @ApiOperation({
    summary: '获取三人格提醒（Persona Alerts）',
    description: '获取当前行程的三人格（Abu、Dr.Dre、Neptune）提醒列表',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回提醒列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getPersonaAlerts(@Param('id') id: string) {
    try {
      const alerts = await this.tripsService.getPersonaAlerts(id);
      return successResponse(alerts);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/decision-log')
  @ApiOperation({
    summary: '获取决策记录/透明日志（Decision Log）',
    description: '获取行程的决策记录，用于透明日志展示',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '返回记录数量，默认 10' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: '偏移量，默认 0' })
  @ApiResponse({
    status: 200,
    description: '成功返回决策记录（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getDecisionLog(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 10;
      const offsetNum = offset ? parseInt(offset, 10) : 0;
      const log = await this.tripsService.getDecisionLog(id, limitNum, offsetNum);
      return successResponse(log);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/evidence')
  @ApiOperation({
    summary: '获取行程证据列表',
    description: '获取指定行程的所有证据项列表，用于 EvidenceDrawer 组件的证据标签页显示',
  })
  @ApiParam({ name: 'id', description: '行程 ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取证据列表',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在',
    type: ApiErrorResponseDto,
  })
  async getEvidence(
    @Param('id') id: string,
    @Query() query: GetEvidenceQueryDto
  ) {
    try {
      const result = await this.tripsService.getEvidence(id, query);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      this.logger.error(`获取证据列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取证据列表失败', { originalError: error.message });
    }
  }

  @Get(':id/tasks')
  @ApiOperation({
    summary: '获取今日重点任务（Today\'s Tasks）',
    description: '获取系统推荐的今日重点任务列表',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回任务列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getTasks(@Param('id') id: string) {
    try {
      const tasks = await this.tripsService.getTasks(id);
      return successResponse(tasks);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Patch(':id/tasks/:taskId')
  @ApiOperation({
    summary: '更新任务状态',
    description: '更新指定任务的完成状态',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'taskId', description: '任务 ID' })
  @ApiBody({ type: UpdateTaskStatusDto })
  @ApiResponse({
    status: 200,
    description: '成功更新任务状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或任务不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async updateTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() updateTaskStatusDto: UpdateTaskStatusDto,
  ) {
    try {
      const task = await this.tripsService.updateTaskStatus(id, taskId, updateTaskStatusDto.completed);
      return successResponse(task);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/pipeline-status')
  @ApiOperation({
    summary: '获取工作流 Pipeline 状态',
    description: '获取行程的工作流 Pipeline 各阶段状态',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回Pipeline状态（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getPipelineStatus(@Param('id') id: string) {
    try {
      const status = await this.tripsService.getPipelineStatus(id);
      return successResponse(status);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post('draft')
  @ApiOperation({
    summary: '生成行程草案',
    description: '生成一个可预览的行程草案（不落库）。LLM 只负责选择与编排，所有行程项必须来自 place 表。',
  })
  @ApiBody({ type: CreateTripDraftDto })
  @ApiResponse({
    status: 200,
    description: '行程草案生成成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async createDraft(@Body() dto: CreateTripDraftDto) {
    try {
      const draft = await this.tripDraftService.generateDraft(dto);
      return successResponse(draft);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`生成行程草案失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '生成行程草案失败');
    }
  }

  @Post(':tripId/items/:itemId/replace')
  @ApiOperation({
    summary: '替换单个行程项',
    description: 'Neptune 修复机制：替换单个行程项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'itemId', description: '行程项 ID' })
  @ApiBody({ type: ReplaceItineraryItemDto })
  @ApiResponse({
    status: 200,
    description: '替换成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async replaceItem(
    @Param('tripId') tripId: string,
    @Param('itemId') itemId: string,
    @Body() dto: ReplaceItineraryItemDto
  ) {
    try {
      const result = await this.tripDraftService.replaceItem(tripId, itemId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`替换行程项失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '替换行程项失败');
    }
  }

  @Post(':tripId/regenerate')
  @ApiOperation({
    summary: '全局重生成行程',
    description: '重生成整个行程，但保持用户已锁定的项',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({ type: RegenerateTripDto })
  @ApiResponse({
    status: 200,
    description: '重生成成功（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async regenerateTrip(
    @Param('tripId') tripId: string,
    @Body() dto: RegenerateTripDto
  ) {
    try {
      const result = await this.tripDraftService.regenerateTrip(tripId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      this.logger.error(`重生成行程失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message || '重生成行程失败');
    }
  }

  @Get(':id/days/:dayId/metrics')
  @ApiOperation({
    summary: '获取每日行程指标',
    description: '获取指定日期的行程指标，包括步行距离、车程、缓冲时间、疲劳指数等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'dayId', description: '日期 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回每日指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或日期不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getDayMetrics(
    @Param('id') id: string,
    @Param('dayId') dayId: string
  ) {
    try {
      const metrics = await this.tripMetricsService.getDayMetrics(id, dayId);
      return successResponse(metrics);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/metrics')
  @ApiOperation({
    summary: '批量获取多日指标',
    description: '获取行程的多日指标，支持按日期过滤',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'dates', description: '日期数组（可选）', type: [String], required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回指标（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getTripMetrics(
    @Param('id') id: string,
    @Query('dates') dates?: string | string[]
  ) {
    try {
      const dateArray = Array.isArray(dates) ? dates : dates ? [dates] : undefined;
      const metrics = await this.tripMetricsService.getTripMetrics(id, dateArray);
      return successResponse(metrics);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/conflicts')
  @ApiOperation({
    summary: '获取行程冲突列表',
    description: '获取行程的冲突列表，包括时间冲突、午餐时间窗、疲劳超标等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'date', description: '指定日期（可选）', required: false })
  @ApiQuery({ name: 'severity', description: '过滤严重程度（可选）', enum: ConflictSeverity, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回冲突列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getConflicts(
    @Param('id') id: string,
    @Query('date') date?: string,
    @Query('severity') severity?: ConflictSeverity
  ) {
    try {
      const conflicts = await this.tripConflictsService.getConflicts(id, date, severity);
      return successResponse(conflicts);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Put(':id/intent')
  @ApiOperation({
    summary: '更新行程意图与约束',
    description: '更新行程的意图与约束，包括节奏配置、偏好设置、约束条件、规划策略等',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: UpdateIntentRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功更新意图（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async updateIntent(
    @Param('id') id: string,
    @Body() dto: UpdateIntentRequestDto
  ) {
    try {
      const result = await this.tripIntentService.updateIntent(id, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/intent')
  @ApiOperation({
    summary: '获取行程意图与约束',
    description: '获取行程的意图与约束配置',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回意图（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getIntent(@Param('id') id: string) {
    try {
      const intent = await this.tripIntentService.getIntent(id);
      return successResponse(intent);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/apply-optimization')
  @ApiOperation({
    summary: '应用优化结果到行程',
    description: '将优化结果应用到实际行程，支持预览模式',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: ApplyOptimizationRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功应用优化结果（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async applyOptimization(
    @Param('id') id: string,
    @Body() dto: ApplyOptimizationRequestDto
  ) {
    try {
      const result = await this.tripOptimizationService.applyOptimization(id, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/items/:itemId/detail')
  @ApiOperation({
    summary: '获取行程项详细信息',
    description: '获取行程项的详细信息，包括完整的 Place metadata 和 physicalMetadata',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'itemId', description: '行程项 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回详细信息（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或行程项不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getItemDetail(
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    try {
      const item = await this.prisma.itineraryItem.findUnique({
        where: { id: itemId },
        include: {
          Place: true,
          TripDay: {
            include: {
              Trip: true,
            },
          },
        },
      });

      if (!item) {
        throw new NotFoundException(`行程项 ID ${itemId} 不存在`);
      }

      // 验证行程项属于指定行程
      if (item.TripDay?.tripId !== id) {
        throw new NotFoundException(`行程项不属于指定行程`);
      }

      return successResponse(item);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/items/batch-update')
  @ApiOperation({
    summary: '批量更新行程项',
    description: '批量更新多个行程项的时间、地点等信息',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiBody({ type: BatchUpdateItemsRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功批量更新（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async batchUpdateItems(
    @Param('id') id: string,
    @Body() dto: BatchUpdateItemsRequestDto
  ) {
    try {
      const errors: Array<{ itemId: string; error: string }> = [];
      let updatedCount = 0;

      for (const update of dto.updates) {
        try {
          // 验证行程项属于指定行程
          const item = await this.prisma.itineraryItem.findUnique({
            where: { id: update.itemId },
            include: {
              TripDay: true,
            },
          });

          if (!item) {
            errors.push({ itemId: update.itemId, error: '行程项不存在' });
            continue;
          }

          if (item.TripDay?.tripId !== id) {
            errors.push({ itemId: update.itemId, error: '行程项不属于指定行程' });
            continue;
          }

          // 更新行程项
          const updateData: any = {};
          if (update.startTime) {
            updateData.startTime = DateTime.fromISO(update.startTime).toJSDate();
          }
          if (update.endTime) {
            updateData.endTime = DateTime.fromISO(update.endTime).toJSDate();
          }
          if (update.placeId) {
            updateData.placeId = update.placeId;
          }
          if (update.note !== undefined) {
            updateData.note = update.note;
          }

          await this.prisma.itineraryItem.update({
            where: { id: update.itemId },
            data: updateData,
          });

          updatedCount++;
        } catch (error: any) {
          errors.push({ itemId: update.itemId, error: error.message || '更新失败' });
        }
      }

      const result: BatchUpdateItemsResponseDto = {
        success: errors.length === 0,
        updatedCount,
        failedCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      };

      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 异步生成行程规划点（后台任务）
   * 不阻塞主请求，在后台执行
   */
  private async generateDraftAsync(tripId: string, draftDto: CreateTripDraftDto): Promise<void> {
    try {
      this.logger.log(`开始为行程 ${tripId} 生成行程规划点（后台任务）`);
      
      // 更新进度：开始生成
      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'retrieving_candidates',
        message: '正在检索候选地点...',
      });
      
      // 生成草案（包含 LLM 编排）
      const draft = await this.tripDraftService.generateDraft(draftDto, (progress) => {
        // LLM 编排完成回调
        return this.updateGenerationProgress(tripId, progress);
      });
      
      // 更新进度：LLM 编排完成，开始保存
      await this.updateGenerationProgress(tripId, {
        status: 'generating',
        stage: 'saving_items',
        message: 'LLM 编排完成，正在保存行程项...',
      });
      
      // 将草案保存为行程项
      const itemsCount = await this.tripDraftService.createItineraryItemsFromDraft(
        tripId,
        draft
      );
      
      // 更新进度：全部完成
      await this.updateGenerationProgress(tripId, {
        status: 'completed',
        stage: 'completed',
        message: `成功生成 ${itemsCount} 个行程项`,
        itemsCount,
      });
      
      this.logger.log(`成功为行程 ${tripId} 生成 ${itemsCount} 个行程项（后台任务完成）`);
    } catch (error: any) {
      this.logger.error(`后台生成行程规划点失败 (tripId: ${tripId}): ${error.message}`, error.stack);
      
      // 更新进度：失败
      await this.updateGenerationProgress(tripId, {
        status: 'failed',
        stage: 'error',
        message: `生成失败: ${error.message}`,
      }).catch((updateError: any) => {
        this.logger.error(`更新进度失败: ${updateError.message}`);
      });
    }
  }

  /**
   * 更新行程生成进度
   */
  private async updateGenerationProgress(
    tripId: string,
    progress: {
      status: 'generating' | 'completed' | 'failed';
      stage: string;
      message: string;
      itemsCount?: number;
    }
  ): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        this.logger.warn(`行程 ${tripId} 不存在，无法更新进度`);
        return;
      }

      const metadata = (trip.metadata as any) || {};
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...metadata,
            generationProgress: {
              ...progress,
              updatedAt: new Date().toISOString(),
            },
          } as any,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error(`更新行程生成进度失败: ${error.message}`);
      // 不抛出错误，避免影响主流程
    }
  }

  @Get(':id/suggestions')
  @ApiOperation({
    summary: '获取建议列表',
    description: '获取指定行程的建议列表，支持多种过滤条件。整合了三人格（Abu/Dr.Dre/Neptune）的输出和冲突检测结果。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiQuery({ name: 'persona', description: '过滤人格类型', enum: SuggestionPersona, required: false })
  @ApiQuery({ name: 'scope', description: '过滤作用范围', enum: SuggestionScope, required: false })
  @ApiQuery({ name: 'scopeId', description: '过滤作用范围ID', required: false })
  @ApiQuery({ name: 'severity', description: '过滤严重级别', enum: SuggestionSeverity, required: false })
  @ApiQuery({ name: 'status', description: '过滤状态', enum: SuggestionStatus, required: false })
  @ApiQuery({ name: 'limit', description: '返回数量限制', type: Number, required: false })
  @ApiQuery({ name: 'offset', description: '偏移量', type: Number, required: false })
  @ApiResponse({
    status: 200,
    description: '成功返回建议列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getSuggestions(
    @Param('id') id: string,
    @Query('persona') persona?: SuggestionPersona,
    @Query('scope') scope?: SuggestionScope,
    @Query('scopeId') scopeId?: string,
    @Query('severity') severity?: SuggestionSeverity,
    @Query('status') status?: SuggestionStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const result = await this.tripSuggestionsService.getSuggestions(id, {
        persona,
        scope,
        scopeId,
        severity,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Get(':id/suggestions/stats')
  @ApiOperation({
    summary: '获取建议统计',
    description: '获取建议的统计数据，用于角标显示和汇总。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: '成功返回建议统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getSuggestionStats(@Param('id') id: string) {
    try {
      const stats = await this.tripSuggestionsService.getSuggestionStats(id);
      return successResponse(stats);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/suggestions/:suggestionId/apply')
  @ApiOperation({
    summary: '应用建议',
    description: '应用一个建议，执行对应的操作（如应用替代路线、调整节奏等）。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'suggestionId', description: '建议 ID' })
  @ApiBody({ type: ApplySuggestionRequestDto })
  @ApiResponse({
    status: 200,
    description: '成功应用建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或建议不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async applySuggestion(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string,
    @Body() dto: ApplySuggestionRequestDto
  ) {
    try {
      const result = await this.tripSuggestionsService.applySuggestion(id, suggestionId, dto);
      return successResponse(result);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Post(':id/suggestions/:suggestionId/dismiss')
  @ApiOperation({
    summary: '忽略建议',
    description: '忽略一个建议，标记为已忽略状态。',
  })
  @ApiParam({ name: 'id', description: '行程 ID (UUID)' })
  @ApiParam({ name: 'suggestionId', description: '建议 ID' })
  @ApiResponse({
    status: 200,
    description: '成功忽略建议（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '行程或建议不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async dismissSuggestion(
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string
  ) {
    try {
      await this.tripSuggestionsService.dismissSuggestion(id, suggestionId);
      return successResponse(null);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
