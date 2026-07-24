// src/agent/assistants/journey-assistant/journey-assistant.controller.ts

import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  JourneyAssistantService,
} from './services/journey-assistant.service';
import { mapJourneyApiContext } from './utils/journey-emotional-context.util';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  JourneyChatRequestDto,
  JourneyBaseRequestDto,
  HandleEventRequestDto,
  AdjustScheduleRequestDto,
  JourneyAssistantResponseDto,
  QuickActionsResponseDto,
} from './dto/journey-assistant.dto';
import type { JourneyAssistantResponse } from './interfaces/journey-assistant.interface';

@ApiTags('行程助手智能体')
@Controller('agent/journey-assistant')
export class JourneyAssistantController {
  constructor(private readonly journeyAssistantService: JourneyAssistantService) {}

  /**
   * 对话
   */
  @Public()
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '与行程助手对话', 
    description: '旅途中与行程助手对话，可查询行程、寻找附近地点、请求导航等' 
  })
  @ApiResponse({
    status: 200,
    description: '对话成功',
    type: JourneyAssistantResponseDto,
  })
  async chat(@Body() dto: JourneyChatRequestDto): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'chat',
      tripId: dto.tripId,
      userId: dto.userId,
      message: dto.message,
      language: dto.language,
      context: mapJourneyApiContext(dto.context),
    });
  }

  /**
   * 获取快捷操作
   */
  @Public()
  @Get('trips/:tripId/quick-actions')
  @ApiOperation({
    summary: '获取快捷操作',
    description: '根据行程目的地、用户偏好等返回个性化快捷操作按钮',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: QuickActionsResponseDto,
  })
  async getQuickActions(
    @Param('tripId') tripId: string,
  ): Promise<QuickActionsResponseDto> {
    return await this.journeyAssistantService.getQuickActions(tripId);
  }

  /**
   * 获取行程状态
   */
  @Public()
  @Get('trips/:tripId/status')
  @ApiOperation({ 
    summary: '获取行程状态', 
    description: '获取当前行程的状态，包括今日安排、进度、预算使用情况等' 
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: JourneyAssistantResponseDto,
  })
  async getStatus(
    @Param('tripId') tripId: string,
  ): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'get_status',
      tripId,
      userId: 'default', // 简化实现
    });
  }

  /**
   * 获取提醒列表
   */
  @Public()
  @Get('trips/:tripId/reminders')
  @ApiOperation({ 
    summary: '获取提醒列表', 
    description: '获取当前行程的所有待办提醒' 
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: JourneyAssistantResponseDto,
  })
  async getReminders(
    @Param('tripId') tripId: string,
  ): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'get_reminders',
      tripId,
      userId: 'default',
    });
  }

  /**
   * 处理突发事件
   */
  @Public()
  @Post('events/handle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '处理突发事件', 
    description: '处理航班延误、景点关闭等突发事件，获取应急方案或执行已选方案' 
  })
  @ApiResponse({
    status: 200,
    description: '处理成功',
    type: JourneyAssistantResponseDto,
  })
  async handleEvent(@Body() dto: HandleEventRequestDto): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'handle_event',
      tripId: dto.tripId,
      userId: dto.userId,
      eventId: dto.eventId,
      selectedOptionId: dto.selectedOptionId,
      language: dto.language,
      context: mapJourneyApiContext(dto.context),
    });
  }

  /**
   * 调整行程
   */
  @Public()
  @Post('schedule/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '调整行程', 
    description: '调整行程安排，包括改时间、取消活动、替换活动等' 
  })
  @ApiResponse({
    status: 200,
    description: '调整成功',
    type: JourneyAssistantResponseDto,
  })
  async adjustSchedule(@Body() dto: AdjustScheduleRequestDto): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'adjust_schedule',
      tripId: dto.tripId,
      userId: dto.userId,
      adjustmentParams: {
        itemId: dto.adjustmentParams.itemId,
        newTime: dto.adjustmentParams.newTime,
        cancel: dto.adjustmentParams.cancel,
        replace: dto.adjustmentParams.replace,
      },
      language: dto.language,
      context: mapJourneyApiContext(dto.context),
    });
  }

  /**
   * 紧急求助
   */
  @Public()
  @Post('emergency')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '紧急求助', 
    description: '紧急情况下获取帮助，包括医院、警察、大使馆等信息' 
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: JourneyAssistantResponseDto,
  })
  async emergencyHelp(@Body() dto: JourneyBaseRequestDto): Promise<JourneyAssistantResponse> {
    return await this.journeyAssistantService.handle({
      action: 'chat',
      tripId: dto.tripId,
      userId: dto.userId,
      message: '紧急求助 SOS',
      language: dto.language,
      context: mapJourneyApiContext(dto.context),
    });
  }

  /**
   * 附近搜索
   */
  @Public()
  @Post('nearby')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '附近搜索', 
    description: '搜索附近的餐厅、景点、医院等' 
  })
  @ApiResponse({
    status: 200,
    description: '搜索成功',
    type: JourneyAssistantResponseDto,
  })
  async nearbySearch(
    @Body() dto: JourneyChatRequestDto,
  ): Promise<JourneyAssistantResponse> {
    const searchMessage = dto.message || '附近有什么好吃的';
    return await this.journeyAssistantService.handle({
      action: 'nearby',
      tripId: dto.tripId,
      userId: dto.userId,
      message: searchMessage,
      language: dto.language,
      context: mapJourneyApiContext(dto.context),
    });
  }
}
