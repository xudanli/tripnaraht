import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import {
  AdvisorPlanBPreDecisionDto,
  ConflictFeedbackDto,
  ConflictFindingActionDto,
  CreateAdvisorCandidateDto,
  ListAdvisorProjectsQueryDto,
  ReadinessFeedbackDto,
  ReadinessFindingActionDto,
  RecordPlanBOutcomeDto,
  SubmitAdvisorDecisionDto,
} from '../dto/gate1.dto';
import { Gate1AdvisorAccessGuard } from '../guards/gate1-advisor-access.guard';
import { Gate1ConflictService, Gate1CandidateService } from '../services/gate1-output.services';
import { Gate1DecisionService } from '../services/gate1-decision.service';
import { Gate1PrivacyService } from '../services/gate1-privacy.service';
import { Gate1ReadinessService } from '../services/gate1-readiness.service';
import { Gate1PlanBService } from '../services/gate1-plan-b.service';
import { Gate1AdvisorWorkspaceService } from '../services/gate1-advisor-workspace.service';
import { Gate1TrustSurfaceService } from '../services/gate1-trust-surface.service';
import { Gate1AccessService } from '../services/gate1-access.service';
import { Gate1ProjectService } from '../services/gate1-project.service';
import { Gate1ParticipantReminderService } from '../services/gate1-participant-reminder.service';
import { DecisionWorkspaceReadService } from '../../decision-runtime/services/decision-workspace-read.service';
import { isDecisionRuntimeReadFromProjectionEnabled } from '../../decision-runtime/decision-runtime.config';
import { Gate1RuntimeCommandHandler } from '../commands/gate1-runtime-command.handler';
import { Gate1RuntimeCommandType } from '../../decision-runtime/commands/gate1-runtime-command.types';

@ApiTags('gate1-advisor')
@Controller('advisor')
export class Gate1AdvisorController {
  constructor(
    private readonly workspace: Gate1AdvisorWorkspaceService,
    private readonly trustSurface: Gate1TrustSurfaceService,
    private readonly access: Gate1AccessService,
    private readonly projects: Gate1ProjectService,
    private readonly conflicts: Gate1ConflictService,
    private readonly candidates: Gate1CandidateService,
    private readonly decisions: Gate1DecisionService,
    private readonly privacy: Gate1PrivacyService,
    private readonly readiness: Gate1ReadinessService,
    private readonly planB: Gate1PlanBService,
    private readonly reminders: Gate1ParticipantReminderService,
    private readonly runtimeRead: DecisionWorkspaceReadService,
    private readonly commands: Gate1RuntimeCommandHandler,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: '工作台首页（待办、高风险、漏斗、Gate 摘要）' })
  async dashboard(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.workspace.getDashboard(user.userId));
  }

  @Get('projects')
  @ApiOperation({ summary: '顾问项目列表（筛选、按待办排序）' })
  async listProjects(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListAdvisorProjectsQueryDto,
  ) {
    return successResponse(await this.workspace.listProjects(user.userId, query));
  }

  @Get('organizations/:organizationId/portfolio')
  @ApiOperation({ summary: '机构项目组合看板（Agency Admin）' })
  async orgPortfolio(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    await this.access.assertOrgPortfolioAccess(organizationId, user.userId, user.roles);
    return successResponse(
      await this.workspace.getOrgPortfolio(organizationId, user.userId, user.roles),
    );
  }

  @Get('projects/:projectId/overview')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '项目概览（摘要、下一动作、关键指标）' })
  async overview(@Param('projectId') projectId: string) {
    return successResponse(await this.workspace.getOverview(projectId));
  }

  @Get('projects/:projectId/trust-surface')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '标准信任卡片（置信度 + 替代方案 + 数据来源）' })
  async trustSurfaceCards(@Param('projectId') projectId: string) {
    return successResponse(await this.trustSurface.getTrustSurface(projectId));
  }

  @Get('projects/:projectId/constraints')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '脱敏约束与缺失信息摘要' })
  async constraints(@Param('projectId') projectId: string) {
    return successResponse(await this.workspace.getConstraintsSummary(projectId));
  }

  @Get('projects/:projectId/work-logs')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '项目人工工时汇总' })
  async workLogs(@Param('projectId') projectId: string) {
    return successResponse(await this.projects.listWorkLogs(projectId));
  }

  @Post('projects/:projectId/participants/:participantId/remind')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '顾问催办成员填写（24h 限频）' })
  async remindParticipant(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Param('participantId') participantId: string,
  ) {
    return successResponse(
      await this.reminders.sendAdvisorInitiatedReminder(projectId, participantId, user.userId),
    );
  }

  @Get('projects/:projectId/audit-timeline')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '项目审计时间线（Decision Runtime 事件）' })
  async auditTimeline(@Param('projectId') projectId: string) {
    return successResponse(await this.runtimeRead.getAuditTimeline(projectId));
  }

  @Get('projects/:projectId/runtime-workspace')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: 'Decision Runtime 影子投影工作台（M3 灰度读）' })
  async runtimeWorkspace(@Param('projectId') projectId: string) {
    return successResponse(await this.runtimeRead.getWorkspace(projectId));
  }

  @Get('projects/:projectId/conflicts')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '查看已发布冲突报告（脱敏，无原始私密）' })
  async conflictsList(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { items } = await this.runtimeRead.getConflicts(projectId);
      return successResponse(items);
    }
    return successResponse(await this.conflicts.getPublishedForAdvisor(projectId));
  }

  @Get('projects/:projectId/candidates')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '查看已发布候选方案' })
  async candidatesList(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { items } = await this.runtimeRead.getCandidates(projectId);
      return successResponse(items);
    }
    return successResponse(await this.candidates.listForAdvisor(projectId));
  }

  @Get('projects/:projectId/candidates/compare')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '对比两个候选方案版本（AC-06）' })
  async compareCandidates(
    @Param('projectId') projectId: string,
    @Query('a') candidateAId: string,
    @Query('b') candidateBId: string,
  ) {
    return successResponse(await this.candidates.compare(projectId, candidateAId, candidateBId));
  }

  @Post('projects/:projectId/strategies')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '顾问创建修改版方案（不覆盖原版本，AC-07）' })
  async createAdvisorStrategy(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateAdvisorCandidateDto,
  ) {
    return successResponse(await this.candidates.createAdvisorVersion(projectId, user.userId, body));
  }

  @Get('projects/:projectId/sanitized-constraints')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '查看已审核脱敏约束（兼容旧路径）' })
  async sanitized(@Param('projectId') projectId: string) {
    return successResponse(await this.privacy.listSanitizedForAdvisor(projectId));
  }

  @Post('projects/:projectId/decision')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '提交顾问决策记录' })
  async decision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: SubmitAdvisorDecisionDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_DECISION,
        projectId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Get('projects/:projectId/decision')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '最新决策记录' })
  async latestDecision(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { item } = await this.runtimeRead.getLatestDecision(projectId);
      return successResponse(item);
    }
    return successResponse(await this.decisions.getLatest(projectId));
  }

  @Get('projects/:projectId/decisions')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '决策记录历史（审计回放）' })
  async decisionHistory(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { items } = await this.runtimeRead.getDecisions(projectId);
      return successResponse(items);
    }
    return successResponse(await this.decisions.listAll(projectId));
  }

  @Post('projects/conflicts/findings/:findingId/feedback')
  @ApiOperation({ summary: '顾问反馈单条冲突（价值评价）' })
  async conflictFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('findingId') findingId: string,
    @Body() body: ConflictFeedbackDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_CONFLICT_FEEDBACK,
        findingId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post('projects/conflicts/findings/:findingId/actions')
  @ApiOperation({ summary: '确认/驳回/解决冲突（AC-05）' })
  async conflictAction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('findingId') findingId: string,
    @Body() body: ConflictFindingActionDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_CONFLICT_ACTION,
        findingId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Get('projects/:projectId/readiness')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '查看已发布 Readiness 报告' })
  async readinessList(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { items } = await this.runtimeRead.getReadiness(projectId);
      return successResponse(items);
    }
    return successResponse(await this.readiness.getPublishedForAdvisor(projectId));
  }

  @Post('projects/readiness/findings/:findingId/feedback')
  @ApiOperation({ summary: '顾问反馈 Readiness finding' })
  async readinessFeedback(
    @CurrentUser() user: CurrentUserPayload,
    @Param('findingId') findingId: string,
    @Body() body: ReadinessFeedbackDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_READINESS_FEEDBACK,
        findingId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Post('projects/readiness/findings/:findingId/actions')
  @ApiOperation({ summary: 'Readiness finding 操作（分配/接受风险/解决）' })
  async readinessAction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('findingId') findingId: string,
    @Body() body: ReadinessFindingActionDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_READINESS_ACTION,
        findingId,
        actorId: user.userId,
        dto: body,
      }),
    );
  }

  @Get('projects/:projectId/plan-b')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '查看已发布 Plan B 列表' })
  async planBList(@Param('projectId') projectId: string) {
    if (isDecisionRuntimeReadFromProjectionEnabled()) {
      const { items } = await this.runtimeRead.getPlanBs(projectId);
      return successResponse(items);
    }
    return successResponse(await this.planB.listForAdvisor(projectId));
  }

  @Post('projects/plan-b/:planBId/pre-decision')
  @ApiOperation({ summary: '顾问预先接受/拒绝 Plan B' })
  async planBPreDecision(@Param('planBId') planBId: string, @Body() body: AdvisorPlanBPreDecisionDto) {
    return successResponse(await this.planB.recordPreDecision(planBId, body));
  }

  @Post('projects/:projectId/plan-b/:planBId/outcome')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '记录 Plan B 触发与采用结果（行中/复盘）' })
  async planBOutcome(
    @Param('projectId') projectId: string,
    @Param('planBId') planBId: string,
    @Body() body: RecordPlanBOutcomeDto,
  ) {
    return successResponse(await this.planB.recordOutcome(projectId, planBId, body));
  }
}
