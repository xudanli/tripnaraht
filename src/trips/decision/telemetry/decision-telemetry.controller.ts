import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../../common/dto/standard-response.dto';
import { DecisionTelemetryService } from './decision-telemetry.service';
import { DecisionTelemetryReplayService } from './decision-telemetry-replay.service';
import type { ReplayCounterfactualInput } from './decision-telemetry-replay.service';
import { FulfillmentCapabilityService } from './fulfillment-capability.service';
import { DecisionFeedbackLoopService } from './decision-feedback-loop.service';
import { TravelDnaInferenceService } from './travel-dna-inference.service';
import type { DecisionTelemetryEvent } from './decision-telemetry.types';
import type { FulfillmentCapabilityRecordInput } from './fulfillment-capability.types';
import type { FeedbackLoopCloseInput } from './decision-feedback-loop.service';

@ApiTags('Decision Telemetry')
@Controller('decision/telemetry')
export class DecisionTelemetryController {
  constructor(
    private readonly telemetry: DecisionTelemetryService,
    private readonly replay: DecisionTelemetryReplayService,
    private readonly fulfillment: FulfillmentCapabilityService,
    private readonly feedbackLoop: DecisionFeedbackLoopService,
    private readonly travelDna: TravelDnaInferenceService,
  ) {}

  @Public()
  @Post('events')
  @ApiOperation({
    summary: '记录决策结构事件（context + 反事实候选 + 因果 + 归一化 outcome）',
  })
  @ApiBody({ description: 'DecisionTelemetryEvent' })
  async recordEvent(@Body() body: DecisionTelemetryEvent) {
    try {
      const result = await this.telemetry.record(body);
      return successResponse(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResponse(ErrorCode.BAD_REQUEST, msg);
    }
  }

  @Public()
  @Post('replay/counterfactual')
  @ApiOperation({
    summary: '决策回放 — 若当时选另一候选会发生什么',
    description: '从 logging → intelligence 的分水岭能力',
  })
  async replayCounterfactual(@Body() body: ReplayCounterfactualInput) {
    try {
      const result = await this.replay.replayCounterfactual(body);
      return successResponse(result);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return errorResponse(ErrorCode.BAD_REQUEST, msg);
    }
  }

  @Public()
  @Post('fulfillment')
  @ApiOperation({ summary: '记录 B 端履约能力样本（冰岛 MVP）' })
  async recordFulfillment(@Body() body: FulfillmentCapabilityRecordInput) {
    const result = await this.fulfillment.record(body);
    if (!result) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'Fulfillment record failed');
    }
    return successResponse(result);
  }

  @Public()
  @Get('fulfillment/:countryCode')
  @ApiOperation({ summary: '查询 B 端履约能力记录' })
  @ApiQuery({ name: 'capabilityType', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  async listFulfillment(
    @Param('countryCode') countryCode: string,
    @Query('capabilityType') capabilityType?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const rows = await this.fulfillment.listByCountry(countryCode, {
      capabilityType,
      supplierId,
    });
    return successResponse({ items: rows });
  }

  @Public()
  @Post('feedback-loop/close')
  @ApiOperation({ summary: '关闭决策反馈环（满意度 → 履约画像）' })
  async closeFeedbackLoop(@Body() body: FeedbackLoopCloseInput) {
    const summary = await this.feedbackLoop.closeLoop(body);
    return successResponse(summary);
  }

  @Public()
  @Get('travel-dna/:userId')
  @ApiOperation({ summary: '获取用户行为 Travel DNA（非心理测评）' })
  async getTravelDna(@Param('userId') userId: string) {
    const profile = await this.travelDna.getBehavioralProfile(userId);
    return successResponse({ profile });
  }
}
