import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { PublishingPermissionService } from '../services/publishing-permission.service';
import { SubmitPublishingPermissionApplicationDto } from '../dto/identity-governance.dto';

@ApiTags('identity-governance')
@Controller('identity/publishing')
export class PublishingPermissionController {
  constructor(private readonly publishingPermission: PublishingPermissionService) {}

  @Get('permission')
  @ApiOperation({ summary: '查询当前发布权限等级' })
  async getPermission(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.publishingPermission.getUserPermission(user.userId));
  }

  @Get('applications')
  @ApiOperation({ summary: '查询当前用户的发布权限申请记录' })
  async listApplications(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.publishingPermission.listApplicationsForUser(user.userId));
  }

  @Post('applications')
  @ApiOperation({ summary: '申请升级发布权限（需人工审核）' })
  async submitApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SubmitPublishingPermissionApplicationDto,
  ) {
    return successResponse(
      await this.publishingPermission.submitApplication(
        user.userId,
        body.requestedLevel,
        body.reason,
        body.subjectType ?? 'USER',
        body.subjectId,
      ),
    );
  }
}
