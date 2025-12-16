// src/trips/trips.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { TripExtendedService } from './services/trip-extended.service';
import { TripRecapService } from './services/trip-recap.service';
import { LlmService } from '../llm/services/llm.service';
import { CreateTripDto, MobilityTag } from './dto/create-trip.dto';
import { CreateTripFromNaturalLanguageDto } from './dto/create-trip-from-nl.dto';
import { TripStateDto } from './dto/trip-state.dto';
import { ScheduleResponseDto, SaveScheduleDto } from './dto/schedule.dto';
import { CreateTripShareDto } from './dto/trip-share.dto';
import { AddCollaboratorDto } from './dto/trip-collaborator.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);

  constructor(
    private readonly tripsService: TripsService,
    private readonly tripExtendedService: TripExtendedService,
    private readonly tripRecapService: TripRecapService,
    private readonly llmService: LlmService
  ) {}

  @Post()
  @ApiOperation({ 
    summary: '创建新行程',
    description: '创建新行程并自动计算节奏策略（木桶效应）和预算切分。系统会根据旅行者信息自动计算体力限制和地形限制，并根据预算推荐酒店档次。'
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
  async create(@Body() createTripDto: CreateTripDto) {
    try {
      const trip = await this.tripsService.create(createTripDto);
      return successResponse(trip);
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
  async createFromNaturalLanguage(@Body() dto: CreateTripFromNaturalLanguageDto) {
    try {
      // 使用 LLM 解析自然语言
      const parseResult = await this.llmService.naturalLanguageToTripParams({
        text: dto.text,
        provider: dto.llmProvider,
      });

      // 如果需要澄清，返回澄清问题
      if (parseResult.needsClarification) {
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
      const trip = await this.tripsService.create(createTripDto);
      
      return successResponse({
        trip,
        parsedParams: parseResult.params,
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
  async findAll() {
    const trips = await this.tripsService.findAll();
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
  async findOne(@Param('id') id: string) {
    try {
      const trip = await this.tripsService.findOne(id);
      return successResponse(trip);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
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
    description: '添加行程协作者，设置查看/编辑权限。',
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

  @Get('collected')
  @ApiOperation({
    summary: '获取用户收藏的行程列表',
    description: '获取当前用户收藏的所有行程列表。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回收藏列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getCollectedTrips() {
    try {
      // TODO: 从认证中间件获取当前用户ID
      const userId = 'default-user';
      const trips = await this.tripExtendedService.getCollectedTrips(userId);
      return successResponse(trips);
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
}
