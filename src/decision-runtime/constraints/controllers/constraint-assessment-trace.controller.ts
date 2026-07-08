import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { successResponse } from '../../../common/dto/standard-response.dto';
import { ConstraintAssessmentTraceService } from '../services/constraint-assessment-trace.service';

@ApiTags('constraint-assessment-trace')
@Public()
@Controller('trips/:tripId')
export class ConstraintAssessmentTraceController {
  constructor(private readonly trace: ConstraintAssessmentTraceService) {}

  @Get('constraint-trace')
  @ApiOperation({
    summary: '约束评估溯源（Phase 1）',
    description:
      '聚合 ConstraintAssessment + DecisionProblem + ConstraintPolicy 引用，用于语义收口调试。' +
      '不改变正式热路径；需 CONSTRAINT_ASSESSMENT_TRACE_ENABLED=true（默认开启）。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({ name: 'semanticKey', required: false, description: '按 semanticKey 过滤' })
  async getConstraintTrace(
    @Param('tripId') tripId: string,
    @Query('semanticKey') semanticKey?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const data = await this.trace.buildTrace(tripId, {
      semanticKey,
      userId: user?.userId?.toString(),
    });
    return successResponse(data);
  }
}
