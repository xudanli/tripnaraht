// src/trips/trips.controller.ts
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripStateDto } from './dto/trip-state.dto';
import { ScheduleResponseDto, SaveScheduleDto } from './dto/schedule.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('trips')
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

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
}
