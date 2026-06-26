import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { TripDomainInfluenceService } from './services/trip-domain-influence.service';
import { PreferenceRoundService } from '../process-fairness/services/preference-round.service';

@ApiTags('trip-collaborative-tasks')
@Public()
@Controller('trips/:tripId/collaborative-tasks')
export class TripCollaborativeTasksController {
  constructor(
    private readonly domainService: TripDomainInfluenceService,
    private readonly roundService: PreferenceRoundService,
  ) {}

  @Get()
  @ApiOperation({ summary: '结构化协商任务列表（中/高交叉领域）' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const { tasks } = await this.domainService.listCollaborativeTasks(
        tripId,
        this.resolveUserId(user),
      );
      const enriched = await Promise.all(
        tasks.map(async (task) => {
          const activeRoundId =
            task.activeRoundId ??
            (await this.roundService.getActiveRoundForDomain(tripId, task.domain));
          if (!activeRoundId) {
            return task;
          }
          if (task.status === 'consensus_reached') {
            return { ...task, activeRoundId };
          }
          return {
            ...task,
            activeRoundId,
            status: 'in_discussion' as const,
            statusLabel: '讨论中',
          };
        }),
      );
      return successResponse({ tasks: enriched });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) {
      return user.userId;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('未认证或 token 无效');
  }
}
