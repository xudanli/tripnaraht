import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { Gate1ConflictService, Gate1CandidateService } from '../services/gate1-output.services';
import { Gate1PrivacyService } from '../services/gate1-privacy.service';
import { Gate1ReadinessService } from '../services/gate1-readiness.service';
import { Gate1PlanBService } from '../services/gate1-plan-b.service';
import { Gate1ProjectService } from '../services/gate1-project.service';
import {
  AssignPrivacyAnalystDto,
  CreateCandidateDto,
  CreateChangeNoticeDto,
  CreateParticipantTaskDto,
  CreatePlanBDto,
  CreateSanitizedConstraintDto,
  PublishOutputDto,
  ReadPrivateConstraintDto,
  ReviewSanitizedConstraintDto,
  UpsertConflictReportDto,
  UpsertReadinessReportDto,
  WaiveParticipantTaskDto,
} from '../dto/gate1.dto';
import { Gate1ParticipantTaskService } from '../services/gate1-participant-task.service';
import { Gate1ChangeNoticeService } from '../services/gate1-change-notice.service';
import { Gate1ProjectFitBridgeService } from '../services/gate1-project-fit-bridge.service';
import { Gate1ParticipantReminderService } from '../services/gate1-participant-reminder.service';
import { LinkTrustedListingDto } from '../dto/gate1.dto';
import { Gate1OpsAccessGuard } from '../guards/gate1-ops-access.guard';
import { Gate1RuntimeCommandHandler } from '../commands/gate1-runtime-command.handler';
import { Gate1RuntimeCommandType } from '../../decision-runtime/commands/gate1-runtime-command.types';

@ApiTags('gate1-ops')
@Controller('ops/projects')
@UseGuards(Gate1OpsAccessGuard)
export class Gate1OpsController {
  constructor(
    private readonly projects: Gate1ProjectService,
    private readonly conflicts: Gate1ConflictService,
    private readonly candidates: Gate1CandidateService,
    private readonly privacy: Gate1PrivacyService,
    private readonly readiness: Gate1ReadinessService,
    private readonly planB: Gate1PlanBService,
    private readonly participantTasks: Gate1ParticipantTaskService,
    private readonly changeNotices: Gate1ChangeNoticeService,
    private readonly portalBridge: Gate1ProjectFitBridgeService,
    private readonly reminders: Gate1ParticipantReminderService,
    private readonly commands: Gate1RuntimeCommandHandler,
  ) {}

  @Get('queue')
  @ApiOperation({ summary: '运营订单队列' })
  async queue() {
    return successResponse(await this.projects.getOpsQueue());
  }

  @Post(':projectId/privacy-analysts')
  @ApiOperation({ summary: '指定隐私分析员' })
  async assignAnalyst(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: AssignPrivacyAnalystDto,
  ) {
    return successResponse(await this.privacy.assignAnalyst(projectId, user.userId, body));
  }

  @Post(':projectId/private-constraints/read')
  @ApiOperation({ summary: '隐私分析员读取原始私密字段（留痕）' })
  async readPrivate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: ReadPrivateConstraintDto,
  ) {
    return successResponse(
      await this.privacy.listPrivateConstraints(projectId, user.userId, body),
    );
  }

  @Post(':projectId/sanitized-constraints')
  @ApiOperation({ summary: '上传脱敏约束' })
  async createSanitized(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateSanitizedConstraintDto,
  ) {
    return successResponse(await this.privacy.createSanitized(projectId, user.userId, body));
  }

  @Patch(':projectId/sanitized-constraints/:constraintId/review')
  @ApiOperation({ summary: '审核脱敏约束' })
  async reviewSanitized(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('constraintId') constraintId: string,
    @Body() body: ReviewSanitizedConstraintDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.REVIEW_SANITIZED_CONSTRAINT,
        projectId,
        constraintId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/conflicts')
  @ApiOperation({ summary: '创建/更新冲突报告草稿' })
  async upsertConflict(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: UpsertConflictReportDto,
  ) {
    return successResponse(await this.conflicts.upsertDraft(projectId, user.userId, body));
  }

  @Post(':projectId/conflicts/:version/publish')
  @ApiOperation({ summary: '发布冲突报告' })
  async publishConflict(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('version') version: string,
    @Body() body: PublishOutputDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.PUBLISH_CONFLICT,
        projectId,
        version: Number(version),
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/candidates')
  @ApiOperation({ summary: '上传候选方案草稿' })
  async createCandidate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateCandidateDto,
  ) {
    return successResponse(await this.candidates.createDraft(projectId, user.userId, body));
  }

  @Post(':projectId/candidates/:candidateId/publish')
  @ApiOperation({ summary: '发布候选方案' })
  async publishCandidate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('candidateId') candidateId: string,
    @Body() body: PublishOutputDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.PUBLISH_CANDIDATE,
        projectId,
        candidateId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/readiness')
  @ApiOperation({ summary: '创建/更新 Readiness 报告草稿' })
  async upsertReadiness(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: UpsertReadinessReportDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.UPSERT_READINESS_DRAFT,
        projectId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/readiness/:version/publish')
  @ApiOperation({ summary: '发布 Readiness 报告' })
  async publishReadiness(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('version') version: string,
    @Body() body: PublishOutputDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.PUBLISH_READINESS,
        projectId,
        version: Number(version),
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/plan-b')
  @ApiOperation({ summary: '创建 Plan B 草稿' })
  async createPlanB(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreatePlanBDto,
  ) {
    return successResponse(await this.planB.createDraft(projectId, user.userId, body));
  }

  @Post(':projectId/plan-b/:planBId/publish')
  @ApiOperation({ summary: '发布 Plan B' })
  async publishPlanB(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('planBId') planBId: string,
    @Body() body: PublishOutputDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.PUBLISH_PLAN_B,
        projectId,
        planBId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post(':projectId/participant-tasks')
  @ApiOperation({ summary: '分配成员 Readiness 个人任务' })
  async createParticipantTask(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateParticipantTaskDto,
  ) {
    return successResponse(await this.participantTasks.createTask(projectId, user.userId, body));
  }

  @Post(':projectId/participant-tasks/:taskId/waive')
  @ApiOperation({ summary: '豁免非强制成员任务' })
  async waiveParticipantTask(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: WaiveParticipantTaskDto,
  ) {
    return successResponse(await this.participantTasks.waiveTask(projectId, taskId, user.userId, body));
  }

  @Get(':projectId/readiness-aggregate')
  @ApiOperation({ summary: '团队 Readiness 聚合阻塞数（不泄露成员详情）' })
  async readinessAggregate(@Param('projectId') projectId: string) {
    return successResponse(await this.participantTasks.getProjectBlockingAggregate(projectId));
  }

  @Post(':projectId/change-notices')
  @ApiOperation({ summary: '发布行中变化通知' })
  async publishChangeNotice(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateChangeNoticeDto,
  ) {
    return successResponse(await this.changeNotices.publish(projectId, user.userId, body));
  }

  @Post(':projectId/link-trusted-listing')
  @ApiOperation({ summary: '将可信旅行项目 Listing 绑定到 Gate1 成员门户项目' })
  async linkTrustedListing(
    @Param('projectId') projectId: string,
    @Body() body: LinkTrustedListingDto,
  ) {
    return successResponse(await this.portalBridge.linkListingToGate1Project(body.listingId, projectId));
  }

  @Post('reminders/run')
  @ApiOperation({ summary: '手动触发成员提醒（偏好未完成 + 方案待反馈）' })
  async runReminders() {
    return successResponse(await this.reminders.runAll());
  }
}
