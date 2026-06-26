import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { SplitOrchestratorService } from '../services/split-orchestrator.service';
import type {
  LocationHeartbeatInput,
  ProposeSplitInput,
  ReunionUpdateInput,
  ShareExperienceInput,
} from '../types/split-orchestrator.types';

@ApiTags('trip-in-trip-split')
@Public()
@Controller('trips/:tripId/in-trip/split')
export class TripSplitOrchestratorController {
  constructor(private readonly split: SplitOrchestratorService) {}

  @Post('propose')
  @ApiOperation({ summary: '生成分组活动方案' })
  async propose(
    @Param('tripId') tripId: string,
    @Body() body: ProposeSplitInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.propose(tripId, userId, body ?? {}));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: '分组 session 列表' })
  async listSessions(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.listSessions(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '分组 session 详情' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  async getSession(
    @Param('tripId') tripId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.getSession(tripId, sessionId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('sessions/:sessionId/execute')
  @ApiOperation({ summary: '确认执行分组方案（组织者）' })
  async execute(
    @Param('tripId') tripId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.execute(tripId, sessionId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('sessions/:sessionId/share')
  @ApiOperation({ summary: '分享分组体验卡片' })
  async share(
    @Param('tripId') tripId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ShareExperienceInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.shareExperience(tripId, sessionId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('sessions/:sessionId/reunion')
  @ApiOperation({ summary: '更新汇合实况' })
  async reunion(
    @Param('tripId') tripId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ReunionUpdateInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.updateReunion(tripId, sessionId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('sessions/:sessionId/location')
  @ApiOperation({ summary: '拆队期间位置心跳' })
  async location(
    @Param('tripId') tripId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: LocationHeartbeatInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.split.recordLocation(tripId, sessionId, userId, body));
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
