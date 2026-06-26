import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { CreateGate1ProjectDto, CreateTravelEventDto, ManualWorkLogDto, SubmitBaselineDto, SubmitProjectOutcomeDto, TransitionProjectDto } from '../dto/gate1.dto';
import { Gate1ProjectService, Gate1BaselineService } from '../services/gate1-project.service';
import { Gate1ParticipantService } from '../services/gate1-participant.service';
import { Gate1AnalyticsService } from '../services/gate1-support.services';
import { Gate1OutcomeService } from '../services/gate1-outcome.service';
import { Gate1AdvisorAccessGuard } from '../guards/gate1-advisor-access.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1RuntimeCommandHandler } from '../commands/gate1-runtime-command.handler';
import { Gate1RuntimeCommandType } from '../../decision-runtime/commands/gate1-runtime-command.types';

@ApiTags('gate1')
@Controller('gate1/projects')
export class Gate1ProjectController {
  constructor(
    private readonly projects: Gate1ProjectService,
    private readonly baselines: Gate1BaselineService,
    private readonly participants: Gate1ParticipantService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly outcomes: Gate1OutcomeService,
    private readonly prisma: PrismaService,
    private readonly commands: Gate1RuntimeCommandHandler,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建 Gate1 实验项目' })
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: CreateGate1ProjectDto) {
    return successResponse(await this.projects.create(user.userId, body));
  }

  @Get()
  @ApiOperation({ summary: '顾问项目列表' })
  async list(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.projects.list(user.userId));
  }

  @Get(':id')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '项目详情' })
  async detail(@Param('id') id: string) {
    return successResponse(await this.projects.getDetail(id));
  }

  @Patch(':id/status')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '变更项目生命周期状态（含取消/归档原因）' })
  async transitionStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: TransitionProjectDto,
  ) {
    return successResponse(await this.projects.transitionStatus(id, user.userId, body));
  }

  @Post(':id/baseline')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '提交/更新 Baseline（confirm=true 锁定）' })
  async submitBaseline(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: SubmitBaselineDto,
  ) {
    return successResponse(await this.baselines.submit(id, user.userId, body));
  }

  @Get(':id/baseline')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '最新 Baseline' })
  async getBaseline(@Param('id') id: string) {
    return successResponse(await this.baselines.getLatest(id));
  }

  @Get(':id/participants/progress')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '成员邀请与填写进度（不含私密内容）' })
  async participantProgress(@Param('id') id: string) {
    return successResponse(await this.participants.listProgress(id));
  }

  @Post(':id/work-logs')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '补录人工工时' })
  async workLog(@Param('id') id: string, @Body() body: ManualWorkLogDto) {
    const log = await this.prisma.gate1ManualWorkLog.create({
      data: {
        projectId: id,
        taskType: body.taskType,
        assigneeId: body.assigneeId,
        artifactRef: body.artifactRef ?? null,
        minutes: body.minutes ?? null,
        notes: body.notes ?? null,
      },
    });
    return successResponse(log);
  }

  @Get(':id/work-logs')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '项目人工工时列表' })
  async listWorkLogs(@Param('id') id: string) {
    return successResponse(await this.projects.listWorkLogs(id));
  }

  @Post(':id/travel-events')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '记录行中事件' })
  async travelEvent(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: CreateTravelEventDto,
  ) {
    return successResponse(await this.outcomes.createTravelEvent(id, user.userId, body));
  }

  @Get(':id/travel-events')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '行中事件列表' })
  async listTravelEvents(@Param('id') id: string) {
    return successResponse(await this.outcomes.listTravelEvents(id));
  }

  @Get(':id/outcome')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: 'Outcome 闭环（顾问结果 + 行中事件 + 成员反馈汇总）' })
  async outcome(@Param('id') id: string) {
    return successResponse(await this.outcomes.getOutcome(id));
  }

  @Post(':id/outcome')
  @UseGuards(Gate1AdvisorAccessGuard)
  @ApiOperation({ summary: '提交项目 Outcome（顾问价值评价、商业结果、完成实验）' })
  async submitOutcome(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: SubmitProjectOutcomeDto,
  ) {
    return successResponse(
      await this.commands.execute({
        type: Gate1RuntimeCommandType.RECORD_OUTCOME,
        projectId: id,
        actorId: user.userId,
        dto: body,
      }),
    );
  }
}

@ApiTags('gate1-metrics')
@Controller('gate1/metrics')
export class Gate1MetricsController {
  constructor(private readonly analytics: Gate1AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: '实验看板指标（按 Cohort 隔离）' })
  async metrics(@Query('cohort') cohort?: string) {
    return successResponse(await this.analytics.getMetrics(cohort));
  }

  @Get('export')
  @ApiOperation({ summary: '导出 Gate 决策数据包（去标识化）' })
  async export(@Query('cohort') cohort?: string) {
    return successResponse(await this.analytics.exportDecisionPack(cohort));
  }
}
