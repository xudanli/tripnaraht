import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { GroupPulseService } from '../services/group-pulse.service';
import type {
  AckInterventionInput,
  MicroFeedbackInput,
  MoodCheckInput,
  MotionSignalInput,
} from '../types/group-pulse.types';

@ApiTags('trip-in-trip-pulse')
@Public()
@Controller('trips/:tripId/in-trip/pulse')
export class TripGroupPulseController {
  constructor(private readonly pulse: GroupPulseService) {}

  @Post('mood-check')
  @ApiOperation({ summary: '每日 Mood Check（1–5）' })
  async moodCheck(
    @Param('tripId') tripId: string,
    @Body() body: MoodCheckInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.submitMoodCheck(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('micro-feedback')
  @ApiOperation({ summary: '节点微反馈（1–5）' })
  async microFeedback(
    @Param('tripId') tripId: string,
    @Body() body: MicroFeedbackInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.submitMicroFeedback(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('signals/motion')
  @ApiOperation({ summary: '运动数据上报' })
  async motion(
    @Param('tripId') tripId: string,
    @Body() body: MotionSignalInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.submitMotion(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('my-state')
  @ApiOperation({ summary: '本人五维状态向量' })
  async myState(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.getMyState(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('team-thermometer')
  @ApiOperation({ summary: '团队温度计（组织者可见详情）' })
  async teamThermometer(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.getTeamThermometer(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('interventions')
  @ApiOperation({ summary: '待处理保护性干预卡片' })
  async interventions(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulse.listInterventions(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('interventions/:interventionId/ack')
  @ApiOperation({ summary: '确认或拒绝干预' })
  @ApiParam({ name: 'interventionId', description: '干预 ID' })
  async ackIntervention(
    @Param('tripId') tripId: string,
    @Param('interventionId') interventionId: string,
    @Body() body: AckInterventionInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      if (!body?.action || !['acknowledge', 'dismiss'].includes(body.action)) {
        throw new BadRequestException('action 须为 acknowledge 或 dismiss');
      }
      return successResponse(
        await this.pulse.ackIntervention(tripId, interventionId, userId, body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('需要登录');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ServiceUnavailableException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    throw e;
  }
}
