import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { successResponse } from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { UnifiedConstraintAssessmentService } from '../services/unified-constraint-assessment.service';

@ApiTags('constraint-assessments')
@Public()
@Controller('trips/:tripId')
export class UnifiedConstraintAssessmentController {
  constructor(
    private readonly assessments: UnifiedConstraintAssessmentService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get('constraint-assessments')
  @ApiOperation({
    summary: '统一约束评估读模型（Phase 0）',
    description:
      '按 constraintKey 合并 planning（feasibility）与 executability（TEP SDR）双 lane 评估结果。' +
      'Constraint Console 产品读模型；与 GET /executability（GO/NO-GO）职责分离。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'refresh',
    required: false,
    description: 'true 时强制重算 feasibility + TEP',
  })
  async getConstraintAssessments(
    @Param('tripId') tripId: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.access.resolveUserId(user);
    const data = await this.assessments.buildBundle(tripId, {
      refresh: refresh === 'true' || refresh === '1',
      userId,
    });
    return successResponse(data);
  }
}
