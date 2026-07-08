import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Query,
  Res,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../trip-constraint-solver/services/constraint-solver-access.service';
import { ifNoneMatchMatches } from '../utils/journey-map-etag.util';
import { DecisionSpaceBundleService } from './services/decision-space-bundle.service';
import type { DecisionSpaceBundleSurface } from './types/decision-space-bundle.types';

@ApiTags('decision-space-bundle')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId')
export class DecisionSpaceBundleController {
  constructor(
    private readonly bundle: DecisionSpaceBundleService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('decision-space-bundle')
  @ApiOperation({
    summary: '决策空间首屏 Bundle — 聚合 problem / basis / pack / inspector',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiHeader({ name: 'If-None-Match', required: false })
  async getBundle(
    @Param('tripId') tripId: string,
    @Query('problemId') problemId?: string,
    @Query('proposalId') proposalId?: string,
    @Query('conflictId') conflictId?: string,
    @Query('focusConflictId') focusConflictId?: string,
    @Query('optionId') optionId?: string,
    @Query('surface') surface?: DecisionSpaceBundleSurface,
    @Query('include') include?: string,
    @Query('exclude') exclude?: string,
    @Headers('if-none-match') ifNoneMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);

      if (!problemId?.trim() && !proposalId?.trim()) {
        return errorResponse(
          'BUNDLE_BINDING_REQUIRED',
          'problemId 或 proposalId 至少填一项',
        );
      }

      const data = await this.bundle.getBundle(
        tripId,
        {
          problemId,
          proposalId,
          conflictId,
          focusConflictId,
          optionId,
          surface,
          include,
          exclude,
        },
        { userId },
      );

      if (ifNoneMatchMatches(ifNoneMatch, data.etag)) {
        res?.setHeader('ETag', data.etag);
        res?.setHeader('Cache-Control', 'private, max-age=10');
        res?.status(HttpStatus.NOT_MODIFIED);
        return;
      }

      res?.setHeader('ETag', data.etag);
      res?.setHeader('Cache-Control', 'private, max-age=10');
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-space-bundle/delta')
  @ApiOperation({
    summary: '决策空间 Bundle 增量补全 — 切换方案或 Tab 时仅拉 deferred 模块',
  })
  @ApiHeader({ name: 'If-None-Match', required: false })
  async getDelta(
    @Param('tripId') tripId: string,
    @Query('problemId') problemId?: string,
    @Query('proposalId') proposalId?: string,
    @Query('optionId') optionId?: string,
    @Query('conflictId') conflictId?: string,
    @Query('include') include?: string,
    @Query('since') since?: string,
    @Headers('if-none-match') ifNoneMatch?: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Res({ passthrough: true }) res?: Response,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);

      if (!problemId?.trim()) {
        return errorResponse('BUNDLE_BINDING_REQUIRED', 'problemId 为必填');
      }
      if (!include?.trim()) {
        return errorResponse(
          ErrorCode.VALIDATION_ERROR,
          'include 为必填，例如 inspector.planDiff,inspector.feasibility',
        );
      }

      const etagHint = since ?? ifNoneMatch;
      const data = await this.bundle.getBundle(
        tripId,
        {
          problemId,
          proposalId,
          optionId,
          conflictId,
          include,
        },
        { userId },
      );

      if (etagHint && ifNoneMatchMatches(etagHint, data.etag)) {
        res?.setHeader('ETag', data.etag);
        res?.setHeader('Cache-Control', 'private, max-age=10');
        res?.status(HttpStatus.NOT_MODIFIED);
        return;
      }

      res?.setHeader('ETag', data.etag);
      res?.setHeader('Cache-Control', 'private, max-age=10');
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(tripId: string, user?: CurrentUserPayload): Promise<void> {
    const userId = this.access.resolveUserId(user);
    if (!userId) {
      throw new UnauthorizedException('需要登录');
    }
    await this.access.assertTripMember(tripId, userId);
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse('PROBLEM_NOT_FOUND', e.message);
    }
    if (e instanceof BadRequestException) {
      const msg = e.message;
      if (msg.includes('problemId') && msg.includes('proposalId')) {
        return errorResponse('BUNDLE_BINDING_REQUIRED', msg);
      }
      return errorResponse(ErrorCode.BAD_REQUEST, msg);
    }
    const message = e instanceof Error ? e.message : '内部错误';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
