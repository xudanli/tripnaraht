/**
 * Google Calendar MCP Controller
 * 
 * 提供 Google Calendar 服务的 API 端点
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarIntegrationService } from './google-calendar-integration.service';
import {
  CreateEventDto,
  UpdateEventDto,
  DeleteEventDto,
  ListEventsDto,
  FindEventDto,
  FindFreeSlotsDto,
  QuickAddDto,
} from './dto/google-calendar.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('google-calendar')
@Controller('google-calendar')
@Public() // 临时开放，生产环境可能需要认证
export class GoogleCalendarController {
  private readonly logger = new Logger(GoogleCalendarController.name);

  constructor(
    private readonly googleCalendarService: GoogleCalendarService,
    private readonly integrationService: GoogleCalendarIntegrationService,
  ) {}

  @Get('tools')
  @ApiOperation({
    summary: '列出所有可用工具',
    description: '获取 Google Calendar MCP 服务器提供的所有工具列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listTools() {
    try {
      const result = await this.googleCalendarService.listTools();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('List tools failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取工具列表失败',
      );
    }
  }

  @Get('calendars')
  @ApiOperation({
    summary: '列出所有日历',
    description: '获取用户的所有日历列表',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listCalendars() {
    try {
      const result = await this.googleCalendarService.listCalendars();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('List calendars failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取日历列表失败',
      );
    }
  }

  @Get('events')
  @ApiOperation({
    summary: '列出日历事件',
    description: '根据条件列出日历事件',
  })
  @ApiQuery({ name: 'calendarId', required: false, type: String })
  @ApiQuery({ name: 'timeMin', required: false, type: String })
  @ApiQuery({ name: 'timeMax', required: false, type: String })
  @ApiQuery({ name: 'maxResults', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async listEvents(@Query() query: ListEventsDto) {
    try {
      const result = await this.googleCalendarService.listEvents(query);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('List events failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取事件列表失败',
      );
    }
  }

  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建日历事件',
    description: '创建一个新的日历事件',
  })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({
    status: 201,
    description: '创建成功',
    type: ApiSuccessResponseDto,
  })
  async createEvent(@Body() dto: CreateEventDto) {
    try {
      const result = await this.googleCalendarService.createEvent({
        calendarId: dto.calendarId,
        summary: dto.summary,
        start: dto.start.dateTime ? { dateTime: dto.start.dateTime, timeZone: dto.start.timeZone } : { date: dto.start.date! },
        end: dto.end.dateTime ? { dateTime: dto.end.dateTime, timeZone: dto.end.timeZone } : { date: dto.end.date! },
        description: dto.description,
        location: dto.location,
        attendees: dto.attendees?.map(email => ({ email })),
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Create event failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '创建事件失败',
      );
    }
  }

  @Post('events/:eventId/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '更新日历事件',
    description: '更新指定的日历事件',
  })
  @ApiParam({ name: 'eventId', description: '事件 ID' })
  @ApiBody({ type: UpdateEventDto })
  @ApiResponse({
    status: 200,
    description: '更新成功',
    type: ApiSuccessResponseDto,
  })
  async updateEvent(@Param('eventId') eventId: string, @Body() dto: UpdateEventDto) {
    try {
      const result = await this.googleCalendarService.updateEvent({
        calendarId: dto.calendarId,
        eventId,
        summary: dto.summary,
        start: dto.start?.dateTime ? { dateTime: dto.start.dateTime, timeZone: dto.start.timeZone } : dto.start?.date ? { date: dto.start.date } : undefined,
        end: dto.end?.dateTime ? { dateTime: dto.end.dateTime, timeZone: dto.end.timeZone } : dto.end?.date ? { date: dto.end.date } : undefined,
        description: dto.description,
        location: dto.location,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Update event failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '更新事件失败',
      );
    }
  }

  @Post('events/:eventId/delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除日历事件',
    description: '删除指定的日历事件',
  })
  @ApiParam({ name: 'eventId', description: '事件 ID' })
  @ApiBody({ type: DeleteEventDto })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    type: ApiSuccessResponseDto,
  })
  async deleteEvent(@Param('eventId') eventId: string, @Body() dto: DeleteEventDto) {
    try {
      const result = await this.googleCalendarService.deleteEvent({
        calendarId: dto.calendarId,
        eventId,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Delete event failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '删除事件失败',
      );
    }
  }

  @Post('events/find')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查找日历事件',
    description: '根据查询条件查找日历事件',
  })
  @ApiBody({ type: FindEventDto })
  @ApiResponse({
    status: 200,
    description: '查找成功',
    type: ApiSuccessResponseDto,
  })
  async findEvent(@Body() dto: FindEventDto) {
    try {
      const result = await this.googleCalendarService.findEvent(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Find event failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '查找事件失败',
      );
    }
  }

  @Post('free-slots')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查找空闲时间段',
    description: '查找指定时间范围内的空闲时间段',
  })
  @ApiBody({ type: FindFreeSlotsDto })
  @ApiResponse({
    status: 200,
    description: '查找成功',
    type: ApiSuccessResponseDto,
  })
  async findFreeSlots(@Body() dto: FindFreeSlotsDto) {
    try {
      const result = await this.googleCalendarService.findFreeSlots(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Find free slots failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '查找空闲时间段失败',
      );
    }
  }

  @Post('quick-add')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '快速添加事件',
    description: '使用自然语言快速添加日历事件',
  })
  @ApiBody({ type: QuickAddDto })
  @ApiResponse({
    status: 201,
    description: '添加成功',
    type: ApiSuccessResponseDto,
  })
  async quickAdd(@Body() dto: QuickAddDto) {
    try {
      const result = await this.googleCalendarService.quickAdd(dto);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Quick add failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '快速添加事件失败',
      );
    }
  }

  @Get('current-time')
  @ApiOperation({
    summary: '获取当前日期时间',
    description: '获取当前日期时间（用于测试连接）',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: ApiSuccessResponseDto,
  })
  async getCurrentDateTime() {
    try {
      const result = await this.googleCalendarService.getCurrentDateTime();
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Get current time failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '获取当前时间失败',
      );
    }
  }

  @Post('trips/:tripId/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '同步行程到 Google Calendar',
    description: '将 TripNara 行程同步到用户的 Google Calendar',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
        calendarId: { type: 'string', description: '目标日历 ID（可选）' },
      },
      required: ['userId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '同步成功',
    type: ApiSuccessResponseDto,
  })
  async syncTripToCalendar(
    @Param('tripId') tripId: string,
    @Body() body: { userId: string; calendarId?: string },
  ) {
    try {
      const result = await this.integrationService.syncTripToCalendar(
        tripId,
        body.userId,
        body.calendarId,
      );
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Sync trip to calendar failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '同步行程到日历失败',
      );
    }
  }

  @Post('trips/:tripId/delete-events')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除行程的所有日历事件',
    description: '删除指定行程的所有 Google Calendar 事件',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户 ID' },
      },
      required: ['userId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '删除成功',
    type: ApiSuccessResponseDto,
  })
  async deleteTripEvents(
    @Param('tripId') tripId: string,
    @Body() _body: { userId: string },
  ) {
    try {
      const result = await this.integrationService.deleteTripEvents(tripId);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error('Delete trip events failed:', error);
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        error.message || '删除行程日历事件失败',
      );
    }
  }
}
