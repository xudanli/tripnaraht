import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { TravelStatusService } from '../services/travel-status.service';
import { ConsumerDecisionQueueService } from '../services/consumer-decision-queue.service';
import { AiActivityLogService } from '../services/ai-activity-log.service';

class AcceptRecommendedBodyDto {
  /** Optional override — keepOriginal / defer / non-default repair */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  actionId?: string;
}

@ApiTags('travel-status')
@Public()
@Controller('trips/:tripId')
export class TravelStatusController {
  constructor(
    private readonly travelStatus: TravelStatusService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
    private readonly aiActivityLog: AiActivityLogService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('travel-status')
  @ApiOperation({
    summary: 'AI Native「我的旅行」状态页 BFF',
    description:
      '聚合可执行性、Effective Plan、Consumer Decision Queue、监控占位、自动化授权摘要与近期 AI 工作记录。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getTravelStatus(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.travelStatus.getTravelStatus(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-queue')
  @ApiOperation({
    summary: 'Consumer Decision Queue — 现在需要您决定什么',
    description: '零 engineering 术语；含推荐方案与取舍说明。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getDecisionQueue(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.decisionQueue.getQueue(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-queue/:problemId')
  @ApiOperation({ summary: 'Consumer Decision Queue — 单条详情（含 hydrated 推荐）' })
  async getDecisionQueueItem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.decisionQueue.getItem(tripId, problemId);
      if (!data) {
        return errorResponse(ErrorCode.NOT_FOUND, 'Decision item not found');
      }
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('ai-completed-work/:logId/undo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '撤销 AI 自动修改',
    description: '对 automationChangeLog 中可撤销的自动修改执行 keepOriginal / undo 方案。',
  })
  async undoAutomationChange(
    @Param('tripId') tripId: string,
    @Param('logId') logId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.travelStatus.undoAutomationChange(tripId, logId, userId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('ai-activity-log')
  @ApiOperation({
    summary: 'AI 活动记录 — 时间线 + 今日统计',
    description:
      '聚合 automationChangeLog、决策 resolution 与待确认队列。C 端勿用 autoAllowed/confirmationRequired。',
  })
  async getAiActivityLog(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.aiActivityLog.getLog(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('ai-activity-log/:activityId')
  @ApiOperation({
    summary: 'AI 活动记录 — 单条详情（依据 / 修改前后 / 撤销）',
  })
  async getAiActivityLogDetail(
    @Param('tripId') tripId: string,
    @Param('activityId') activityId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.aiActivityLog.getDetail(tripId, activityId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-queue/:problemId/accept-recommended')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交所选修复方案',
    description:
      'submitResolution + applyResolution。默认用 queue item 的 acceptRecommended.actionId；body.actionId 可覆盖（保留原计划 / 延后等）。',
  })
  async acceptRecommended(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: AcceptRecommendedBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.travelStatus.acceptRecommended(
        tripId,
        problemId,
        userId,
        body.actionId,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(tripId: string, user?: CurrentUserPayload): Promise<void> {
    const userId = this.access.resolveUserId(user);
    await this.access.assertTripMember(tripId, userId);
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('not found') || message.includes('NOT_FOUND')) {
      return errorResponse(ErrorCode.NOT_FOUND, message);
    }
    if (message.includes('required') || message.includes('invalid')) {
      return errorResponse(ErrorCode.BAD_REQUEST, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
