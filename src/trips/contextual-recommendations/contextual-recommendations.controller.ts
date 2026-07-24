import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Body,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { ErrorCode } from '../../common/dto/standard-response.dto';
import { successResponse, errorResponse } from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../trip-constraint-solver/services/constraint-solver-access.service';
import { ContextualRecommendationsService } from './services/contextual-recommendations.service';
import { ContextualRecommendationsCommitService } from './services/contextual-recommendations-commit.service';
import {
  ContextualRecommendationsRequestDto,
  ContextualRecommendationsCommitDto,
} from './dto/contextual-recommendations.dto';

@ApiTags('contextual-recommendations')
@Public()
@Controller('trips/:tripId/contextual-recommendations')
export class ContextualRecommendationsController {
  constructor(
    private readonly recommendations: ContextualRecommendationsService,
    private readonly commitService: ContextualRecommendationsCommitService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '情境化当天微规划（Context Delta + 后端权威上下文 → 方案，非景点卡片列表）',
  })
  async recommend(
    @Param('tripId') tripId: string,
    @Body() body: ContextualRecommendationsRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.recommendations.recommend(
        tripId,
        body ?? ({ scenario: 'SAME_DAY_ACTIVITY' } as ContextualRecommendationsRequestDto),
      );
      return successResponse(data);
    } catch (error) {
      return this.mapError(error);
    }
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '将微规划方案写入当天 Active Plan（加入今天行程）',
  })
  async commit(
    @Param('tripId') tripId: string,
    @Body() body: ContextualRecommendationsCommitDto,
    @Headers('if-match') _ifMatch?: string,
    @Headers('idempotency-key') _idempotencyKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.commitService.commit(
        tripId,
        userId,
        body ?? ({} as ContextualRecommendationsCommitDto),
      );
      return successResponse(data);
    } catch (error) {
      return this.mapError(error);
    }
  }

  private mapError(error: unknown) {
    if (error instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, error.message);
    }
    if (error instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, error.message);
    }
    if (error instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message);
    }
    if (error instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, error.message);
    }
    if (error instanceof ConflictException) {
      return errorResponse('CONTEXT_VERSION_CONFLICT', error.message);
    }
    const message = error instanceof Error ? error.message : '情境推荐失败';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
