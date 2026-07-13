import {
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { ExecutabilityAssessmentService } from '../services/executability-assessment.service';
import { TepLocalRepairApplyService } from '../services/tep-local-repair-apply.service';

@ApiTags('tep-self-drive')
@Public()
@Controller('trips/:tripId/executability')
export class ExecutabilityController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly executability: ExecutabilityAssessmentService,
    private readonly tepRepairApply: TepLocalRepairApplyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '获取自驾行程可执行性评估（TEP ExecutabilityAssessment BFF）',
    description:
      '读模型：基于 feasibility-report issues 投影 TEP ExecutabilityAssessment + 用户可见 UI 态',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: '为 true 时先触发 feasibility validate 再投影',
  })
  async getExecutability(
    @Param('tripId') tripId: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.executability.getExecutability(tripId, {
        refresh: refresh === 'true' || refresh === '1',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('refresh')
  @ApiOperation({
    summary: '刷新可执行性评估',
    description: '等价于 GET ?refresh=true — 先 validate 再返回 TEP 投影',
  })
  async refreshExecutability(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.executability.getExecutability(tripId, { refresh: true });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('repairs/:optionId/apply')
  @ApiOperation({
    summary: '应用 TEP Local Repair（RecoveryOption → PlanVersion 写回）',
    description:
      '接受 adjustment-queue 中 intervention-tep-* 项；支持 action=REMOVE（SDR-101）与 REPLACE（SDR-302 预计算 fallback）',
  })
  @ApiParam({ name: 'optionId', description: 'RecoveryOption.optionId 或 intervention-tep-{optionId}' })
  @ApiQuery({
    name: 'basePlanVersionId',
    required: false,
    description: '用户看到修复预览时的 effective PlanVersion；与当前 effective 不一致时返回 STALE_REPAIR_OPTION',
  })
  async applyTepRepair(
    @Param('tripId') tripId: string,
    @Param('optionId') optionId: string,
    @Query('basePlanVersionId') basePlanVersionId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.tepRepairApply.applyRecoveryOption({
        tripId,
        interventionOrOptionId: optionId,
        userId,
        basePlanVersionId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ConflictException) {
      const body = e.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        const row = body as { code: string; message: string; [key: string]: unknown };
        const { code, message, ...details } = row;
        return errorResponse(code, message, details);
      }
      return errorResponse(ErrorCode.REVISION_CONFLICT, e.message);
    }
    const err = e as Error;
    return errorResponse(ErrorCode.INTERNAL_ERROR, err?.message ?? '内部错误');
  }
}
