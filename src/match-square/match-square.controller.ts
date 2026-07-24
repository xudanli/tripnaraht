import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { MatchSquareService } from './match-square.service';
import { RouteTemplateLaunchRecruitmentService } from './route-template-launch-recruitment.service';
import { LaunchRecruitmentFromTemplateDto } from '../route-directions/dto/launch-recruitment-from-template.dto';
import {
  CreateRecruitmentPostDto,
  CreateRecruitmentApplicationDto,
  DecideRecruitmentApplicationDto,
  ListMyApplicationsQueryDto,
  ListMyRecruitmentPostsQueryDto,
  ListPostApplicationsQueryDto,
  ListRecruitmentPostsQueryDto,
  UpdateRecruitmentPostDto,
  UpdateRecruitmentPostStatusDto,
  UpsertTravelIntentDto,
  UpdateTravelIntentStatusDto,
  SendOliveBranchDto,
  RespondOliveBranchDto,
  GetUserCredentialsQueryDto,
  ParseVibeFreeTextDto,
  SpawnTrekTripDto,
  InstantiateTripDto,
  SovereignForceLockDto,
} from './dto/match-square.dto';

@ApiTags('match-square')
@Controller('match-square')
export class MatchSquareController {
  constructor(
    private readonly matchSquareService: MatchSquareService,
    private readonly routeTemplateLaunchRecruitment: RouteTemplateLaunchRecruitmentService,
  ) {}

  @Public()
  @Get('access')
  @ApiOperation({
    summary: '搭子广场权限门槛',
    description: 'PRD 2.1：未完成测评仅可浏览；完成测评可发帖与申请。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getAccess(@CurrentUser() user: CurrentUserPayload) {
    try {
      const access = await this.matchSquareService.getAccess(user?.userId);
      return successResponse(access);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('filters/options')
  @ApiOperation({ summary: '筛选器选项（人格类型 / 相处模式 / 状态标签）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getFilterOptions() {
    return successResponse(this.matchSquareService.getFilterOptions());
  }

  @Public()
  @Get('posts')
  @ApiOperation({
    summary: '招募帖列表（搭子广场）',
    description:
      '支持目的地模糊匹配、日期范围、MBTI/象限、相处模式多选；登录且完成测评后返回 compatibilityPercent。' +
      'PRD 3.7：offset=0 时 feedItems 可在第 2 张前插入 match_flash 灵魂撮合卡。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listPosts(
    @Query() query: ListRecruitmentPostsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      const result = await this.matchSquareService.listPosts(query, user?.userId);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('my/posts')
  @ApiOperation({ summary: '队长管理面板 — 我的招募帖' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listMyPosts(
    @Query() query: ListMyRecruitmentPostsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.listMyPosts(user.userId, query);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('my/posts/:postId/applications')
  @ApiOperation({
    summary: '队长审批列表（别名路径）',
    description:
      '与 GET /posts/:id/applications 等价；兼容前端 my/posts/:postId/applications 调用。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listMyPostApplications(
    @Param('postId') postId: string,
    @Query() query: ListPostApplicationsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.listPostApplications(postId, query, user);
  }

  @Public()
  @Get('my/applications')
  @ApiOperation({ summary: '我的入队申请列表（队员视角）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listMyApplications(
    @Query() query: ListMyApplicationsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.listMyApplications(user.userId, query);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/apply-preview')
  @ApiOperation({
    summary: '申请前预览（契合度 + 计划硬度冲突弹窗）',
    description: 'PRD 4.3：提交前调用，若 conflictPrompt 存在需用户确认后再 POST applications。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getApplyPreview(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const preview = await this.matchSquareService.getApplyPreview(user.userId, id);
      return successResponse(preview);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts/:id/applications')
  @ApiOperation({ summary: '提交入队申请（留言 ≤200 字）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async createApplication(
    @Param('id') id: string,
    @Body() dto: CreateRecruitmentApplicationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.createApplication(user.userId, id, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/applications')
  @ApiOperation({
    summary: '队长审批列表',
    description: 'PRD 4.2：返回 highlights / warnings 叙事卡片，非裸百分比。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listPostApplications(
    @Param('id') id: string,
    @Query() query: ListPostApplicationsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.listPostApplications(user.userId, id, query);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('posts/:id/applications/:applicationId')
  @ApiOperation({ summary: '队长审批 — 通过 / 拒绝' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async decideApplication(
    @Param('id') id: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: DecideRecruitmentApplicationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.decideApplication(
        user.userId,
        id,
        applicationId,
        dto,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('users/:userId/credentials')
  @ApiOperation({
    summary: 'PRD 3.1.2 — 用户信任档案',
    description:
      '查看他人 verifiedCredentials（详情页信任抽屉、队长审批申请人、雷达选人）。' +
      '可选 postId：当 target 为该帖队长时在 trustAssetLine 附带组队风格胶囊。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getUserCredentials(
    @Param('userId') userId: string,
    @Query() query: GetUserCredentialsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.getUserCredentials(user.userId, userId, {
        postId: query.postId,
      });
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id')
  @ApiOperation({ summary: '招募帖详情' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getPost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      const result = await this.matchSquareService.getPost(id, user?.userId);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/spawn-trek-trip/preview')
  @ApiOperation({
    summary: 'PRD 3.10 — 预览 Premium Trekking spawn',
    description: '读取 _trekkingOrchestration，解析 live/planned 路线与是否可 spawn。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async previewSpawnTrekTrip(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.previewTrekkingSpawn(user.userId, id);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts/:id/spawn-trek-trip')
  @ApiOperation({
    summary: 'PRD 3.10 — 从招募帖 spawn Trip + HikePlan',
    description:
      '队长专用：创建/关联 Trip，写入 hikingSegments + hardTrekTrailPlan + offline pack 元数据，触发 DNA 异步同步。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async spawnTrekTrip(
    @Param('id') id: string,
    @Body() dto: SpawnTrekTripDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.spawnTrekkingTrip(
        user.userId,
        id,
        dto.tripId,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/force-lock/preview')
  @ApiOperation({
    summary: 'PRD 3.15 — 预览队长强制成团',
    description:
      '返回 currentCrew、droppedOpenSlots、physicalDeficits、vaultRecalc、confirmLines；仅队长可调用。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async previewSovereignForceLock(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.previewSovereignForceLock(user.userId, id);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts/:id/force-lock')
  @ApiOperation({
    summary: 'PRD 3.15 — 队长强制成团锁死',
    description:
      '裁剪空缺拼图位、拒绝 pending 申请、closed + 缩编 slotsNeeded；默认链式 instantiate-trip。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async executeSovereignForceLock(
    @Param('id') id: string,
    @Body() dto: SovereignForceLockDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.executeSovereignForceLock(user.userId, id, {
        note: dto.note,
        skipInstantiate: dto.skipInstantiate,
      });
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/instantiation/preview')
  @ApiOperation({
    summary: 'PRD 3.12 — 预览成团 → Active Trip 实例化',
    description: '读取 sealed 状态、Vibe/模板/徒步编排，返回 instantiation 策略与 blockReason。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async previewTripInstantiation(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.previewTripInstantiation(user.userId, id);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts/:id/instantiate-trip')
  @ApiOperation({
    summary: 'PRD 3.12 — 成团锁死后实例化 Active Trip',
    description:
      '队长专用：按策略 reuse_trekking_spawn / trekking_spawn / route_template / minimal_trip 创建 Trip，写入全员 TripCollaborator 与 matchSquareInstantiation 元数据。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async instantiateTrip(
    @Param('id') id: string,
    @Body() dto: InstantiateTripDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.instantiateTripFromPost(
        user.userId,
        id,
        dto.skipIfExists,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('route-templates/:id/launch-recruitment')
  @ApiOperation({
    summary: 'PRD 3.11 链路 A — 以此路线模板发起搭子广场招募',
    description:
      '强绑定 RouteTemplate catalog、GPS/DEM/里程碑与拼图槽位；写入招募帖。路径挂载在 match-square 以避免 RouteDirections ↔ MatchSquare 模块循环依赖。',
  })
  @ApiResponse({ status: 201, type: ApiSuccessResponseDto })
  async launchRecruitmentFromTemplate(
    @Param('id', ParseIntPipe) templateId: number,
    @Body() dto: LaunchRecruitmentFromTemplateDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.routeTemplateLaunchRecruitment.launchRecruitment(
        user.userId,
        templateId,
        dto,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('vibe-llm/parse')
  @ApiOperation({
    summary: 'PRD 4.3 — Vibe LLM 实时意图解析',
    description:
      '发布页键入时 debounce 调用；返回 vibe_chips、hard_gates、slot_definitions 与 suggestedPlanningStyle。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async parseVibeFreeText(
    @Body() dto: ParseVibeFreeTextDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.parseVibeFreeText(dto.freeText);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts')
  @ApiOperation({
    summary: '发起招募',
    description: '需完成人格测评；自动带入队长人格称号、相处模式与历史星级（若有）。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async createPost(
    @Body() dto: CreateRecruitmentPostDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.createPost(user.userId, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('posts/:id')
  @ApiOperation({ summary: '编辑招募帖（队长）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async updatePost(
    @Param('id') id: string,
    @Body() dto: UpdateRecruitmentPostDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.updatePost(user.userId, id, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('posts/:id/status')
  @ApiOperation({
    summary: '招募帖生命周期',
    description: '队长可 active / hidden / closed 切换。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async updatePostStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRecruitmentPostStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.updatePostStatus(user.userId, id, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('my/travel-intent')
  @ApiOperation({ summary: 'PRD 3.7.2 — 读取个人旅行意向（反向撮合信号）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getMyTravelIntent(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.getMyTravelIntent(user.userId);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('my/travel-intent')
  @ApiOperation({ summary: 'PRD 3.7.2 — 挂起/更新旅行意向' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async upsertTravelIntent(
    @Body() dto: UpsertTravelIntentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.upsertTravelIntent(user.userId, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('my/travel-intent/status')
  @ApiOperation({ summary: '暂停/恢复旅行意向' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async updateTravelIntentStatus(
    @Body() dto: UpdateTravelIntentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.updateTravelIntentStatus(user.userId, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('posts/:id/radar')
  @ApiOperation({ summary: 'PRD 3.7.2 — 队长雷达：扫描挂起意向的高匹配自由人' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getCaptainRadar(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.getCaptainRadar(user.userId, id);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('posts/:id/olive-branch')
  @ApiOperation({ summary: 'PRD 3.7.2 — 队长投递橄榄枝 🌟' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async sendOliveBranch(
    @Param('id') id: string,
    @Body() dto: SendOliveBranchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.sendOliveBranch(user.userId, id, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('my/olive-branch-invitations')
  @ApiOperation({ summary: '队员收件箱 — 待处理橄榄枝邀请' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listMyOliveBranchInvitations(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.listMyOliveBranchInvitations(user.userId);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('olive-branch-invitations/:invitationId')
  @ApiOperation({ summary: '队员回应橄榄枝 — 接受查看行程 / 婉拒' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async respondOliveBranch(
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondOliveBranchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.matchSquareService.respondOliveBranch(
        user.userId,
        invitationId,
        dto,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        return errorResponse(ErrorCode.FORBIDDEN, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }
}
