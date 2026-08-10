/**
 * iOS 常用路径别名：POST /api/mobile/trips/:tripId/accommodations/apply
 * 与正式入口 POST /api/agent/planning-assistant/v2/trips/:tripId/accommodations/apply 同实现。
 */

import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../auth/decorators/public.decorator';
import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import {
  ApplyAccommodationToItineraryRequestDto,
  ApplyAccommodationToItineraryResponseDto,
} from '../dto/v2/apply-accommodation-to-itinerary.dto';

@ApiTags('mobile-planning')
@Public()
@Controller('mobile/trips/:tripId')
export class MobileAccommodationApplyController {
  constructor(private readonly planningAssistantV2Service: PlanningAssistantV2Service) {}

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('accommodations/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '将住宿加入行程（mobile 别名）',
    description:
      '等同 /api/agent/planning-assistant/v2/trips/:tripId/accommodations/apply。body 可带 sessionId+index，或直接传 accommodationCard（route_and_run applySnapshot）。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, description: '写入成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async applyAccommodationToItinerary(
    @Param('tripId') tripId: string,
    @Body() dto: ApplyAccommodationToItineraryRequestDto,
  ): Promise<ApplyAccommodationToItineraryResponseDto> {
    return this.planningAssistantV2Service.applyAccommodationToItinerary(tripId, dto);
  }
}
