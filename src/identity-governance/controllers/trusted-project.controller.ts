import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { TrustedProjectListingService } from '../services/trusted-project-listing.service';
import {
  CreateTrustedProjectDto,
  CloseTrustedProjectDto,
  LinkTrustedProjectTripDto,
  ListTrustedProjectsQueryDto,
  ReviewTrustedProjectApplicationDto,
  SubmitTrustedProjectApplicationDto,
} from '../dto/identity-governance.dto';

@ApiTags('trusted-projects')
@Controller('trusted-projects')
export class TrustedProjectController {
  constructor(private readonly trustedProjects: TrustedProjectListingService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '浏览已发布的可信旅行项目' })
  async listPublished(@Query() query: ListTrustedProjectsQueryDto) {
    return successResponse(await this.trustedProjects.listPublished(query));
  }

  @Get('mine/list')
  @ApiOperation({ summary: '我创建/负责的项目列表' })
  async listMine(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.trustedProjects.listMine(user.userId));
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '查看已发布项目详情' })
  async getPublished(@Param('id') id: string) {
    return successResponse(await this.trustedProjects.getPublished(id));
  }

  @Post()
  @ApiOperation({ summary: '创建可信项目草稿（需发布权限）' })
  async createDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateTrustedProjectDto,
  ) {
    return successResponse(await this.trustedProjects.createDraft(user.userId, body));
  }

  @Post(':id/link-trip')
  @ApiOperation({ summary: '将可信项目关联到规划行程（发布者）' })
  async linkTrip(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: LinkTrustedProjectTripDto,
  ) {
    return successResponse(await this.trustedProjects.linkTrip(user.userId, id, body.tripId));
  }

  @Post(':id/submit')
  @ApiOperation({ summary: '提交项目审核' })
  async submitForReview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.trustedProjects.submitForReview(user.userId, id));
  }

  @Post(':id/applications')
  @ApiOperation({ summary: '申请加入已发布项目' })
  async submitApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: SubmitTrustedProjectApplicationDto,
  ) {
    return successResponse(
      await this.trustedProjects.submitApplication(user.userId, id, body.message),
    );
  }

  @Get(':id/applications')
  @ApiOperation({ summary: '查看项目申请列表（发布者）' })
  async listApplications(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.trustedProjects.listApplications(user.userId, id));
  }

  @Post(':id/applications/:applicationId/review')
  @ApiOperation({ summary: '审核加入申请（发布者）' })
  async reviewApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() body: ReviewTrustedProjectApplicationDto,
  ) {
    return successResponse(
      await this.trustedProjects.reviewApplication(user.userId, id, applicationId, body.action),
    );
  }

  @Post(':id/close')
  @ApiOperation({ summary: '发布者关闭项目（记录 PROJECT_CANCELLED_BY_PROVIDER）' })
  async closeListing(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: CloseTrustedProjectDto,
  ) {
    return successResponse(await this.trustedProjects.closeListing(user.userId, id, body.reason));
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: '已批准成员退出项目（记录 MEMBER_WITHDREW）' })
  async withdrawMembership(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.trustedProjects.withdrawMembership(user.userId, id));
  }
}
