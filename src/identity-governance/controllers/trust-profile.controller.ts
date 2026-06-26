import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { TrustProfileService } from '../services/trust-profile.service';

@ApiTags('identity-governance')
@Controller('identity/trust-profiles')
export class TrustProfileController {
  constructor(private readonly trustProfile: TrustProfileService) {}

  @Get('me')
  @ApiOperation({ summary: '我的信任档案聚合视图（含待审计数）' })
  async getMine(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.trustProfile.getMyProfile(user.userId));
  }

  @Public()
  @Get('users/:userId')
  @ApiOperation({ summary: '公开用户信任档案（验证/资质/背书/声誉事实，无综合分）' })
  async getUserProfile(@Param('userId') userId: string) {
    return successResponse(await this.trustProfile.getPublicUserProfile(userId));
  }

  @Public()
  @Get('organizations/:organizationId')
  @ApiOperation({ summary: '公开机构信任档案' })
  async getOrganizationProfile(@Param('organizationId') organizationId: string) {
    return successResponse(await this.trustProfile.getPublicOrganizationProfile(organizationId));
  }
}
