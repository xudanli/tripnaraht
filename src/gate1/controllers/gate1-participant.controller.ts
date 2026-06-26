import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import {
  AcceptInvitationDto,
  AckChangeNoticeDto,
  CompleteParticipantTaskDto,
  ConsentDto,
  CreateInvitationDto,
  ParticipantFeedbackDto,
  ProposalFeedbackDto,
  SavePreferencesDto,
} from '../dto/gate1.dto';
import { Gate1ParticipantService } from '../services/gate1-participant.service';
import { Gate1ParticipantPortalService } from '../services/gate1-participant-portal.service';
import { Gate1TrustSurfaceService } from '../services/gate1-trust-surface.service';
import { Gate1ParticipantTaskService } from '../services/gate1-participant-task.service';
import { Gate1ChangeNoticeService } from '../services/gate1-change-notice.service';
import { Gate1ParticipantNotificationService } from '../services/gate1-participant-notification.service';
import { Gate1OutcomeService } from '../services/gate1-outcome.service';
import { Gate1RuntimeCommandHandler } from '../commands/gate1-runtime-command.handler';
import { Gate1RuntimeCommandType } from '../../decision-runtime/commands/gate1-runtime-command.types';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@ApiTags('gate1-participant')
@Controller()
export class Gate1ParticipantController {
  constructor(
    private readonly participants: Gate1ParticipantService,
    private readonly portal: Gate1ParticipantPortalService,
    private readonly trustSurface: Gate1TrustSurfaceService,
    private readonly tasks: Gate1ParticipantTaskService,
    private readonly changeNoticeService: Gate1ChangeNoticeService,
    private readonly notifications: Gate1ParticipantNotificationService,
    private readonly outcomes: Gate1OutcomeService,
    private readonly commands: Gate1RuntimeCommandHandler,
  ) {}

  @Get('participant/me/projects')
  @ApiOperation({ summary: '已登录用户的多项目成员入口列表' })
  async myProjects(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.participants.listProjectsForUser(user.userId));
  }

  @Post('gate1/projects/:projectId/invitations')
  @ApiOperation({ summary: '创建成员邀请链接' })
  async invite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('projectId') projectId: string,
    @Body() body: CreateInvitationDto,
  ) {
    return successResponse(await this.participants.createInvitation(projectId, user.userId, body));
  }

  @Public()
  @Get('participant/invitations/:token')
  @ApiOperation({ summary: '邀请落地页（项目摘要 + 知情同意）' })
  async landingLegacy(@Param('token') token: string) {
    return successResponse(await this.participants.openInvitation(token));
  }

  @Public()
  @Get('participant/invites/:token')
  @ApiOperation({ summary: 'PRD: 获取邀请摘要' })
  async landing(@Param('token') token: string) {
    return successResponse(await this.participants.openInvitation(token));
  }

  @Public()
  @Post('participant/invites/:token/accept')
  @ApiOperation({ summary: 'PRD: 接受邀请并绑定项目' })
  async accept(
    @Param('token') token: string,
    @Body() body: AcceptInvitationDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const dto: AcceptInvitationDto = {
      ...body,
      userId: body.userId ?? user?.userId,
      contactEmail: body.contactEmail ?? user?.email,
    };
    return successResponse(await this.participants.acceptInvitation(token, dto));
  }

  @Public()
  @Post('participant/consents')
  @ApiOperation({ summary: '接受/拒绝分层知情同意' })
  async consent(@Body() body: ConsentDto) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_PARTICIPANT_CONSENT,
        inviteToken: body.inviteToken,
        dto: body,
      }),
    );
  }

  @Public()
  @Get('participant/projects/:token/dashboard')
  @ApiOperation({ summary: 'PRD: 成员首页聚合（待办、进度、方案摘要）' })
  async dashboard(@Param('token') token: string) {
    return successResponse(await this.portal.getDashboard(token));
  }

  @Public()
  @Get('participant/projects/:token/trust-surface')
  @ApiOperation({ summary: '成员脱敏信任卡片（置信度 + 替代方案 + 数据来源）' })
  async participantTrustSurface(@Param('token') token: string) {
    return successResponse(await this.trustSurface.getParticipantTrustSurface(token));
  }

  @Public()
  @Get('participant/projects/:token/preferences')
  @ApiOperation({ summary: 'PRD: 获取公开偏好与私密约束元数据' })
  async getPreferences(@Param('token') token: string) {
    return successResponse(await this.portal.getPreferences(token));
  }

  @Public()
  @Put('participant/projects/:token/preferences')
  @ApiOperation({ summary: '保存公开偏好（可与私密约束同提交）' })
  async preferences(@Param('token') token: string, @Body() body: SavePreferencesDto) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.SAVE_PARTICIPANT_PREFERENCES,
        inviteToken: token,
        dto: body,
      }),
    );
  }

  @Public()
  @Get('participant/projects/:token/private-constraints')
  @ApiOperation({ summary: 'PRD: 查看本人私密约束元数据（不含原文）' })
  async privateConstraints(@Param('token') token: string) {
    return successResponse(await this.portal.listPrivateConstraints(token));
  }

  @Public()
  @Get('participant/projects/:token/proposals/:candidateId')
  @ApiOperation({ summary: 'PRD: 查看已发布方案' })
  async proposal(@Param('token') token: string, @Param('candidateId') candidateId: string) {
    return successResponse(await this.portal.getProposal(token, candidateId));
  }

  @Public()
  @Post('participant/projects/:token/proposals/:candidateId/feedback')
  @ApiOperation({ summary: 'PRD: 提交方案反馈（绑定方案版本）' })
  async proposalFeedback(
    @Param('token') token: string,
    @Param('candidateId') candidateId: string,
    @Body() body: ProposalFeedbackDto,
  ) {
    return successResponse(await this.portal.submitProposalFeedback(token, candidateId, body));
  }

  @Public()
  @Get('participant/projects/:token/readiness')
  @ApiOperation({ summary: 'PRD: 成员 Readiness 个人任务列表' })
  async readiness(@Param('token') token: string) {
    return successResponse(await this.tasks.listForParticipant(token));
  }

  @Public()
  @Patch('participant/projects/:token/readiness/tasks/:taskId')
  @ApiOperation({ summary: 'PRD: 完成 Readiness 个人任务' })
  async completeReadinessTask(
    @Param('token') token: string,
    @Param('taskId') taskId: string,
    @Body() body: CompleteParticipantTaskDto,
  ) {
    return successResponse(await this.tasks.completeTask(token, taskId, body));
  }

  @Public()
  @Get('participant/projects/:token/change-notices')
  @ApiOperation({ summary: 'PRD: 行中变化通知列表' })
  async changeNotices(@Param('token') token: string) {
    return successResponse(await this.changeNoticeService.listForParticipant(token));
  }

  @Public()
  @Get('participant/projects/:token/change-notices/:noticeId')
  @ApiOperation({ summary: '查看单条变化通知' })
  async changeNotice(@Param('token') token: string, @Param('noticeId') noticeId: string) {
    return successResponse(await this.changeNoticeService.getNotice(token, noticeId));
  }

  @Public()
  @Post('participant/projects/:token/change-notices/:noticeId/ack')
  @ApiOperation({ summary: 'PRD: 确认变化通知' })
  async ackChangeNotice(
    @Param('token') token: string,
    @Param('noticeId') noticeId: string,
    @Body() body: AckChangeNoticeDto,
  ) {
    return successResponse(await this.changeNoticeService.acknowledge(token, noticeId, body));
  }

  @Public()
  @Get('participant/projects/:token/notifications')
  @ApiOperation({ summary: '成员应用内通知列表' })
  async notificationList(@Param('token') token: string) {
    return successResponse(await this.notifications.listForParticipant(token));
  }

  @Public()
  @Post('participant/projects/:token/withdraw')
  @ApiOperation({ summary: '撤回授权并退出项目' })
  async withdraw(@Param('token') token: string) {
    return successResponse(await this.participants.withdraw(token));
  }

  @Public()
  @Post('participant/projects/:token/feedback')
  @ApiOperation({ summary: '行后成员反馈（Outcome）' })
  async feedback(@Param('token') token: string, @Body() body: ParticipantFeedbackDto) {
    return successResponse(await this.outcomes.submitParticipantFeedback(token, body));
  }
}
