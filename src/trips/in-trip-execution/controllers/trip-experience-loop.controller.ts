import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ExperiencePulseService } from '../services/experience-pulse.service';
import { PostTripSummaryService } from '../services/post-trip-summary.service';
import { RecommendationWeightService } from '../services/recommendation-weight.service';
import { InTripAccessService } from '../services/in-trip-access.service';
import type { SubmitExperiencePulseInput } from '../types/experience-loop.types';
import { EXPERIENCE_TAG_MATCH_OPTIONS } from '../../experience-fulfillment/types/experience-outcome.types';

@ApiTags('trip-in-trip-experience')
@Public()
@Controller('trips/:tripId/in-trip/experience')
export class TripExperienceLoopController {
  constructor(
    private readonly pulses: ExperiencePulseService,
    private readonly weights: RecommendationWeightService,
    private readonly postTrip: PostTripSummaryService,
    private readonly access: InTripAccessService,
  ) {}

  @Get('tag-match-options')
  @ApiOperation({ summary: '体验标签匹配选项（PRD §14.3）' })
  async getTagMatchOptions() {
    return successResponse(EXPERIENCE_TAG_MATCH_OPTIONS);
  }

  @Get('pending')
  @ApiOperation({ summary: '待完成微调查触发器' })
  async getPending(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulses.getPending(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('pulses')
  @ApiOperation({ summary: '提交体验微调查' })
  async submitPulse(
    @Param('tripId') tripId: string,
    @Body() body: SubmitExperiencePulseInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.pulses.submit(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('pulses')
  @ApiOperation({ summary: '微调查历史' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listPulses(
    @Param('tripId') tripId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.pulses.listHistory(tripId, userId, {
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('weight-adjustments')
  @ApiOperation({ summary: '推荐权重变更通知' })
  async getWeightAdjustments(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.weights.getWeightAdjustments(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('weight-adjustments/read')
  @ApiOperation({ summary: '标记权重通知已读' })
  async markWeightsRead(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      await this.weights.markAdjustmentsRead(tripId);
      return successResponse({ tripId, read: true });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('post-trip-summary')
  @ApiOperation({ summary: '行后总结（COMPLETED 后）' })
  async getPostTripSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.postTrip.getSummary(tripId, userId));
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
