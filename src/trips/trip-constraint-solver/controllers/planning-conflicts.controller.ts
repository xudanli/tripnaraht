import {
  Controller,
  Get,
  Param,
  BadRequestException,
  ForbiddenException,
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
import { PlanningConflictsService } from '../services/planning-conflicts.service';

@ApiTags('planning-conflicts')
@Public()
@Controller('trips/:tripId')
export class PlanningConflictsController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly planningConflicts: PlanningConflictsService,
  ) {}

  @Get('planning-conflicts')
  @ApiOperation({
    summary: 'Plan Studio 冲突中心聚合（feasibility + schedule）',
    description:
      'M2 BFF：合并 feasibility-report.issues 与 GET /conflicts，去重并输出 gateExecute / summary',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getPlanningConflicts(
    @Param('tripId') tripId: string,
    @Query('includeConstraintsSummary') includeConstraintsSummary?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.planningConflicts.getPlanningConflicts(tripId, {
        includeConstraintsSummary:
          includeConstraintsSummary === '1' || includeConstraintsSummary === 'true',
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
