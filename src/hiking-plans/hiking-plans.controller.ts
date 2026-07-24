import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { HikingPlansService } from './hiking-plans.service';
import type { HikePlanLiveState, HikePlanPrepState } from './types/hike-plan.types';
import {
  CreateHikePlanDto,
  CreateHikePlanWithSegmentDto,
  ListHikePlansQueryDto,
  PatchHikePlanDto,
  PatchLiveStateDto,
  PatchPrepDto,
  PatchReviewDto,
  PostTrackPointsDto,
} from './dto/hike-plan.dto';

@ApiTags('Hiking HikePlans (P1)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hiking/hike-plans')
export class HikingPlansController {
  constructor(private readonly hikePlans: HikingPlansService) {}

  @Post()
  @ApiOperation({ summary: '创建 HikePlan' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateHikePlanDto,
  ) {
    return successResponse(await this.hikePlans.create(user.userId, body));
  }

  @Post('with-segment')
  @ApiOperation({
    summary: '原子创建 HikePlan + 追加 hikingSegments',
    description:
      '在同一事务内创建 HikePlan 并将片段写入 Trip.metadata.hikingSegments（embedded）',
  })
  async createWithSegment(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateHikePlanWithSegmentDto,
  ) {
    return successResponse(await this.hikePlans.createWithSegment(user.userId, body));
  }

  @Get()
  @ApiOperation({ summary: '列表 HikePlan' })
  async list(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListHikePlansQueryDto,
  ) {
    return successResponse(
      await this.hikePlans.list(user.userId, {
        status: query.status,
        routeDirectionId: query.routeDirectionId,
        tripId: query.tripId,
      }),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'HikePlan 详情' })
  async getOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.findOne(user.userId, id));
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新元数据' })
  async patch(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: PatchHikePlanDto,
  ) {
    return successResponse(await this.hikePlans.patch(user.userId, id, body));
  }

  @Post(':id/start')
  @ApiOperation({ summary: '开始徒步 → in_progress' })
  async start(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.start(user.userId, id));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: '完成徒步 → completed' })
  async complete(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.complete(user.userId, id));
  }

  @Post(':id/prep/refresh-template')
  @ApiOperation({
    summary: '从当前路线 hikingDetail 重新生成 prep 模板',
    description: '保留同 id 项的 checked/obtained；运营改 override 后用户可调用',
  })
  async refreshPrepTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.refreshPrepTemplate(user.userId, id));
  }

  @Get(':id/prep')
  async getPrep(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.hikePlans.getPrep(user.userId, id));
  }

  @Patch(':id/prep')
  async patchPrep(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: PatchPrepDto,
  ) {
    return successResponse(
      await this.hikePlans.patchPrep(user.userId, id, body as Partial<HikePlanPrepState>),
    );
  }

  @Get(':id/live-state')
  async getLiveState(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.getLiveState(user.userId, id));
  }

  @Patch(':id/live-state')
  async patchLiveState(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: PatchLiveStateDto,
  ) {
    return successResponse(
      await this.hikePlans.patchLiveState(
        user.userId,
        id,
        body as Partial<HikePlanLiveState>,
      ),
    );
  }

  @Post(':id/track-points')
  @ApiOperation({ summary: '批量上传 GPS（clientBatchId 幂等）' })
  async postTrackPoints(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: PostTrackPointsDto,
  ) {
    return successResponse(
      await this.hikePlans.appendTrackPoints(
        user.userId,
        id,
        body.clientBatchId,
        body.points,
      ),
    );
  }

  @Get(':id/track')
  async getTrack(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.hikePlans.getTrack(user.userId, id));
  }

  @Get(':id/review')
  async getReview(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.hikePlans.getReview(user.userId, id));
  }

  @Post(':id/review/generate')
  async generateReview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.hikePlans.generateReview(user.userId, id));
  }

  @Patch(':id/review')
  async patchReview(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: PatchReviewDto,
  ) {
    return successResponse(await this.hikePlans.patchReview(user.userId, id, body));
  }
}
