import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../../common/dto/api-response.dto';
import { TravelProfileService } from '../services/travel-profile.service';

@ApiTags('user-travel-profile')
@Public()
@Controller('users/me/travel-profile')
export class TravelProfileController {
  constructor(private readonly travelProfileService: TravelProfileService) {}

  @Get()
  @ApiOperation({
    summary: '聚合 Travel Profile（Odyssey + Money DNA + 决策基线）',
    description: 'Odyssey 来自 UserProfile.preferences；Money DNA 独立存储；不覆盖 MBTI 域模型',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getMyTravelProfile(@CurrentUser() user?: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const aggregate = await this.travelProfileService.getAggregate(user.userId);
      return successResponse(aggregate);
    } catch (e) {
      return errorResponse(
        ErrorCode.INTERNAL_ERROR,
        e instanceof Error ? e.message : 'Unknown error',
      );
    }
  }
}
