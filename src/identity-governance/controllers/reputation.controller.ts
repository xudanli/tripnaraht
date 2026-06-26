import { Controller, Get, Param, Post, Query, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { ReputationEventService } from '../services/reputation-event.service';
import { ReputationEventDisputeService } from '../services/reputation-event-dispute.service';
import { ReputationSubjectType } from '../constants/reputation-event.constants';
import { SubmitReputationDisputeDto } from '../dto/project-fit.dto';

@ApiTags('identity-governance')
@Controller('identity/reputation')
export class ReputationController {
  constructor(
    private readonly reputation: ReputationEventService,
    private readonly disputes: ReputationEventDisputeService,
  ) {}

  @Get(':subjectType/:subjectId/summary')
  @ApiOperation({ summary: '可解释声誉事实摘要（非综合信用分）' })
  async getSummary(
    @Param('subjectType') subjectType: ReputationSubjectType,
    @Param('subjectId') subjectId: string,
  ) {
    return successResponse(await this.reputation.getFactsSummary(subjectType, subjectId));
  }

  @Get(':subjectType/:subjectId/events')
  @ApiOperation({ summary: '近期声誉事件列表（公开事实）' })
  async listEvents(
    @Param('subjectType') subjectType: ReputationSubjectType,
    @Param('subjectId') subjectId: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(parseInt(limit, 10) || 20, 50) : 20;
    return successResponse(
      await this.reputation.listRecentEvents(subjectType, subjectId, parsedLimit),
    );
  }

  @Post('disputes')
  @ApiOperation({ summary: '对声誉事实发起争议' })
  async submitDispute(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SubmitReputationDisputeDto,
  ) {
    return successResponse(await this.disputes.submit(user.userId, body.eventId, body.reason));
  }

  @Get('disputes/mine')
  @ApiOperation({ summary: '我的声誉争议列表' })
  async listMyDisputes(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.disputes.listMine(user.userId));
  }
}
