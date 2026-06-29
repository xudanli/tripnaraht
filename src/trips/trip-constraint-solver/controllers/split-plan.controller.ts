import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
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
import { SplitPlanService, type ApplySplitPlanBody } from '../services/split-plan.service';
import type { PatchSplitPlanBody } from '../dto/patch-split-plan.dto';

@ApiTags('split-plans')
@Public()
@Controller('trips/:tripId/split-plans')
export class SplitPlanController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly splitPlans: SplitPlanService,
  ) {}

  @Patch(':splitPlanId')
  @ApiOperation({
    summary: '编辑分流方案（Inspector 分流 Tab）',
    description: '持久化 logistics / 分组 / 汇合点等覆盖项到 trip.metadata.splitPlanOverrides',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'splitPlanId', description: '分流方案 ID' })
  async patchSplitPlan(
    @Param('tripId') tripId: string,
    @Param('splitPlanId') splitPlanId: string,
    @Body() body: PatchSplitPlanBody,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const data = await this.splitPlans.patchSplitPlan(
        tripId,
        splitPlanId.trim(),
        body ?? {},
        userId,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':splitPlanId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '应用分流方案',
    description: '乐观锁 constraintsVersion；成功后 bump version 并记录 appliedSplitPlans',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'splitPlanId', description: '分流方案 ID' })
  async applySplitPlan(
    @Param('tripId') tripId: string,
    @Param('splitPlanId') splitPlanId: string,
    @Body() body: ApplySplitPlanBody,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const data = await this.splitPlans.applySplitPlan(
        tripId,
        splitPlanId.trim(),
        body ?? {},
        userId,
      );
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
      const payload = e.getResponse();
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        const row = payload as { code?: string; message?: string };
        return errorResponse(row.code ?? ErrorCode.BAD_REQUEST, row.message ?? e.message);
      }
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ConflictException) {
      const payload = e.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        const row = payload as { code?: string; message?: string };
        return errorResponse(row.code ?? 'CONSTRAINTS_STALE', row.message ?? e.message);
      }
      return errorResponse('CONSTRAINTS_STALE', e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
