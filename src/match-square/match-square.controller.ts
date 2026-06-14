import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import {
  CreatePostDto,
  ListApplicationsQueryDto,
  ListPostsQueryDto,
  ReviewApplicationDto,
  SubmitApplicationDto,
  UpdatePostStatusDto,
} from './dto/match-square.dto';
import { MatchSquareService } from './services/match-square.service';

@ApiTags('match-square')
@Controller('match-square')
export class MatchSquareController {
  constructor(private readonly matchSquareService: MatchSquareService) {}

  @Public()
  @Get('access')
  @ApiOperation({ summary: '获取搭子广场权限矩阵' })
  async getAccess(@CurrentUser() user?: CurrentUserPayload) {
    return successResponse(await this.matchSquareService.getAccess(user?.userId));
  }

  @Public()
  @Get('filters/options')
  @ApiOperation({ summary: '获取广场筛选选项' })
  getFilterOptions() {
    return successResponse(this.matchSquareService.getFilterOptions());
  }

  @Public()
  @Get('posts')
  @ApiOperation({ summary: '获取招募列表' })
  async listPosts(
    @Query() query: ListPostsQueryDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return successResponse(
      await this.matchSquareService.listPosts(query, user?.userId),
    );
  }

  @Get('my/posts')
  @ApiOperation({ summary: '获取我的招募' })
  async listMyPosts(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.matchSquareService.listMyPosts(user.userId));
  }

  @Get('my/posts/:postId/applications')
  @ApiOperation({ summary: '获取我的招募申请列表（队长别名路径）' })
  async listMyPostApplications(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return successResponse(
      await this.matchSquareService.listPostApplications(
        user.userId,
        postId,
        query.status,
      ),
    );
  }

  @Get('my/applications')
  @ApiOperation({ summary: '获取我的申请' })
  async listMyApplications(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(
      await this.matchSquareService.listMyApplications(user.userId),
    );
  }

  @Post('posts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布招募' })
  async createPost(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreatePostDto,
  ) {
    return successResponse(
      await this.matchSquareService.createPost(user.userId, body),
    );
  }

  @Public()
  @Get('posts/:id/apply-preview')
  @ApiOperation({ summary: '获取申请预览' })
  async getApplyPreview(
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return successResponse(
      await this.matchSquareService.getApplyPreview(id, user?.userId),
    );
  }

  @Get('posts/:id/applications')
  @ApiOperation({ summary: '获取招募申请列表（队长）' })
  async listPostApplications(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query() query: ListApplicationsQueryDto,
  ) {
    return successResponse(
      await this.matchSquareService.listPostApplications(
        user.userId,
        id,
        query.status,
      ),
    );
  }

  @Post('posts/:id/applications')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交申请' })
  async submitApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: SubmitApplicationDto,
  ) {
    return successResponse(
      await this.matchSquareService.submitApplication(user.userId, id, body),
    );
  }

  @Patch('posts/:id/applications/:applicationId')
  @ApiOperation({ summary: '审批申请' })
  async reviewApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() body: ReviewApplicationDto,
  ) {
    return successResponse(
      await this.matchSquareService.reviewApplication(
        user.userId,
        id,
        applicationId,
        body,
      ),
    );
  }

  @Patch('posts/:id/status')
  @ApiOperation({ summary: '更新招募状态' })
  async updatePostStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UpdatePostStatusDto,
  ) {
    return successResponse(
      await this.matchSquareService.updatePostStatus(user.userId, id, body),
    );
  }

  @Public()
  @Get('posts/:id')
  @ApiOperation({ summary: '获取招募详情' })
  async getPost(
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return successResponse(
      await this.matchSquareService.getPost(id, user?.userId),
    );
  }
}
