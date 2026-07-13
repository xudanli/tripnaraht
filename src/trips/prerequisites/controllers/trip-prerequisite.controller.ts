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
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { TripPrerequisiteService } from '../services/trip-prerequisite.service';

@ApiTags('trip-prerequisites')
@Public()
@Controller('trips/:tripId/prerequisites')
export class TripPrerequisiteController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly prerequisites: TripPrerequisiteService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '行程前置条件 SSOT — 预约/确认类共享事实',
    description:
      '同一 prerequisite 双投影至出发准备任务与 feasibility issue（prerequisiteId）。只读聚合，不重复计算 Pack 规则。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async list(@Param('tripId') tripId: string, @CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.prerequisites.listForTrip(tripId);
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
