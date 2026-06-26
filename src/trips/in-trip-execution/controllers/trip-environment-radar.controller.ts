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
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { EnvironmentRadarService } from '../services/environment-radar.service';
import { InTripAccessService } from '../services/in-trip-access.service';
import type { EnvironmentResolveInput, EnvironmentVoteInput } from '../types/environment-event.types';

@ApiTags('trip-in-trip-environment')
@Public()
@Controller('trips/:tripId/in-trip/environment')
export class TripEnvironmentRadarController {
  constructor(
    private readonly radar: EnvironmentRadarService,
    private readonly access: InTripAccessService,
  ) {}

  @Get('events')
  @ApiOperation({ summary: '打开的环境事件列表' })
  async listEvents(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.radar.listOpenEvents(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('events/:eventId')
  @ApiOperation({ summary: '环境事件详情（含替代方案与连锁影响）' })
  @ApiParam({ name: 'eventId', description: '环境事件 ID' })
  async getEvent(
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.radar.getEvent(tripId, eventId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('events/:eventId/vote')
  @ApiOperation({ summary: '对替代方案投票（偏好强度 1–5）' })
  async vote(
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Body() body: EnvironmentVoteInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.radar.voteOnEvent(tripId, eventId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('events/:eventId/resolve')
  @ApiOperation({ summary: '锁定选中替代方案（组织者）' })
  async resolve(
    @Param('tripId') tripId: string,
    @Param('eventId') eventId: string,
    @Body() body: EnvironmentResolveInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.radar.resolveEvent(tripId, eventId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('vulnerability')
  @ApiOperation({ summary: '行程脆弱度仪表盘（按日）' })
  async vulnerability(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.radar.listVulnerability(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('scan')
  @ApiOperation({ summary: '手动触发环境扫描（调试 / 组织者）' })
  async manualScan(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertOrganizer(tripId, userId);
      const created = await this.radar.scanTripEnvironment(tripId, userId);
      return successResponse({ tripId, createdEvents: created });
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    const id = user?.userId?.trim();
    if (id) return id;
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
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    throw e;
  }
}
