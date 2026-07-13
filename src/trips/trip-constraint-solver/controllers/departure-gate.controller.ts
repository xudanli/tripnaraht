import {
  Controller,
  Get,
  Param,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
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
import { DepartureGateService } from '../services/departure-gate.service';

@ApiTags('trip-constraint-solver')
@Public()
@Controller('trips/:tripId/departure-gate')
export class DepartureGateController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly departureGate: DepartureGateService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '出发门控 — 聚合计划可执行性 + 出发准备 + 验证时效',
    description:
      '不重新计算规则；消费 feasibility-report 与 Pack 出发准备项。canStartExecution 为组合结论。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getDepartureGate(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.departureGate.getDepartureGate(tripId);
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
