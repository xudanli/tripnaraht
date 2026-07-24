import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { MemberOnboardingProfilesService } from './services/member-onboarding-profiles.service';

@ApiTags('trip-member-onboarding-profiles')
@Public()
@Controller('trips/:tripId/member-onboarding-profiles')
export class TripMemberOnboardingProfilesController {
  constructor(
    private readonly profilesService: MemberOnboardingProfilesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '读取行程成员入职画像（OWNER / ADVISOR / EDITOR）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getProfiles(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.profilesService.getProfiles(
          tripId,
          this.resolveUserId(user),
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (!user?.userId) {
      throw new UnauthorizedException('需要登录');
    }
    return user.userId;
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    throw e;
  }
}
