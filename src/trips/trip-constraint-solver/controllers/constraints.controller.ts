import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { ApplyRelaxationConstraintsService } from '../services/apply-relaxation-constraints.service';
import { ConstraintsSummaryService } from '../services/constraints-summary.service';
import type { ApplyRelaxationBodyDto } from '../types/apply-relaxation.types';
import type { ConfirmConstraintsBodyDto } from '../types/constraints-summary.types';

@ApiTags('trip-constraints')
@Public()
@Controller('trips/:tripId')
export class ConstraintsSummaryController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    private readonly applyRelaxation: ApplyRelaxationConstraintsService,
  ) {}

  @Get('constraints-summary')
  @ApiOperation({
    summary: '规划约束摘要 BFF（P1-A）',
    description: '替代 FE M1 五路 GET；travel 抽样与 travel-info 同源',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getConstraintsSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.handle(() => this.constraintsSummary.getSummary(tripId), user, tripId);
  }

  /** FE 部分客户端使用 camelCase 路径 */
  @Get('constraintsSummary')
  @ApiOperation({ summary: '（兼容）同 GET .../constraints-summary' })
  async getConstraintsSummaryCamel(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.getConstraintsSummary(tripId, user);
  }

  @Post('planning-constraints/apply-relaxation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '接受 RelaxationSuggestion 并持久化约束变更（P1）',
    description:
      'actionId → budget/pacing/dates/metadata 写入；constraintsVersion +1；返回最新 constraints-summary',
  })
  async applyRelaxationConstraints(
    @Param('tripId') tripId: string,
    @Body() body: ApplyRelaxationBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.access.resolveUserId(user);
    return this.handle(
      () => this.applyRelaxation.applyRelaxation(tripId, userId, body),
      user,
      tripId,
    );
  }

  @Patch('constraints/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '确认规划约束无误（P1-B）',
    description: 'allReady=false → 400 CONSTRAINTS_NOT_READY；version 不匹配 → 409',
  })
  async confirmConstraints(
    @Param('tripId') tripId: string,
    @Body() body: ConfirmConstraintsBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.access.resolveUserId(user);
    return this.handle(
      () => this.constraintsSummary.confirmConstraints(tripId, userId, body),
      user,
      tripId,
    );
  }

  private async handle<T>(
    fn: () => Promise<T>,
    user: CurrentUserPayload | undefined,
    tripId: string,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await fn());
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
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      const payload =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e.message };
      return errorResponse(payload.code ?? ErrorCode.BAD_REQUEST, payload.message ?? e.message);
    }
    if (e instanceof ConflictException) {
      const resp = e.getResponse();
      const payload =
        typeof resp === 'object' && resp !== null
          ? (resp as { code?: string; message?: string })
          : { message: e.message };
      return errorResponse(payload.code ?? 'CONSTRAINTS_STALE', payload.message ?? e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

/** 兼容旧路径 GET .../constraints/summary */
@ApiTags('trip-constraints')
@Public()
@Controller('trips/:tripId/constraints')
export class ConstraintsLegacyController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly constraintsSummary: ConstraintsSummaryService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: '（兼容）同 GET .../constraints-summary' })
  async getSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      return successResponse(await this.constraintsSummary.getSummary(tripId));
    } catch (e) {
      if (e instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, e.message);
      }
      if (e instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, e.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : String(e));
    }
  }
}
