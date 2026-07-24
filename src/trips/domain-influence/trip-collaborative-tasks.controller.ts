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

@ApiTags('trip-collaborative-tasks')
@Public()
@Controller('trips/:tripId/collaborative-tasks')
export class TripCollaborativeTasksController {
  constructor(private readonly domainService: TripDomainInfluenceService) {}

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
      return successResponse({ tasks });
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
