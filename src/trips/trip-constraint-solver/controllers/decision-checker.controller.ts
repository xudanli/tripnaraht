import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { DecisionCheckerService } from '../services/decision-checker.service';
import type { DecisionCheckerRefreshBody } from '../types/decision-checker.types';

@ApiTags('decision-checker')
@Public()
@Controller('trips/:tripId')
export class DecisionCheckerController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly decisionChecker: DecisionCheckerService,
  ) {}

  @Get('decision-checker')
  @ApiOperation({
    summary: '规划工作台决策检查器读模型',
    description:
      'BFF：聚合 planning-conflicts、feasibility、repair-options、证据链与级联影响，四 Tab 投影由后端输出',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getDecisionChecker(
    @Param('tripId') tripId: string,
    @Query('focusConflictId') focusConflictId?: string,
    @Query('planId') planId?: string,
    @Query('constraintsVersion') constraintsVersion?: string,
    @Query('includeStale') includeStale?: string,
    @Query('taskId') taskId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const parsedVersion =
        constraintsVersion != null && constraintsVersion !== ''
          ? Number(constraintsVersion)
          : undefined;
      if (parsedVersion != null && !Number.isFinite(parsedVersion)) {
        throw new BadRequestException('constraintsVersion must be a number');
      }

      const data = await this.decisionChecker.getDecisionChecker(tripId, {
        focusConflictId: focusConflictId?.trim() || undefined,
        planId: planId?.trim() || undefined,
        constraintsVersion: parsedVersion,
        includeStale: includeStale === '1' || includeStale === 'true',
        taskId: taskId?.trim() || undefined,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-checker/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: '触发决策检查器重算（异步 taskId）',
    description: '调用 feasibility validate-scope 后返回 pollUrl；GET 同一路径拉取最新快照',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async refreshDecisionChecker(
    @Param('tripId') tripId: string,
    @Body() body: DecisionCheckerRefreshBody,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.decisionChecker.refreshDecisionChecker(tripId, body ?? {});
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
