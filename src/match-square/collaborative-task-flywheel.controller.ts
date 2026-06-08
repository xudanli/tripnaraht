import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { CollaborativeTaskFlywheelService } from './collaborative-task-flywheel.service';
import { ActiveTripDecisionService } from './active-trip-decision.service';
import { ActiveTripDashboardService } from './active-trip-dashboard.service';
import { RouteContractLockService } from './route-contract-lock.service';
import { ActiveTripDecisionReplayService } from './active-trip-decision-replay.service';
import { TrekkingFitnessBackflowService } from './trekking-fitness-backflow.service';
import {
  AuthorizeRouteContractDto,
  CollaborativeTaskEventDto,
  CommitTemplateBackflowDto,
  PhysicalFitnessEventDto,
  ReorderRouteContractDto,
  TripDecisionEventDto,
} from './dto/match-square.dto';

@ApiTags('trips')
@Controller('trips')
export class CollaborativeTaskFlywheelController {
  constructor(
    private readonly flywheelService: CollaborativeTaskFlywheelService,
    private readonly activeTripDecisionService: ActiveTripDecisionService,
    private readonly activeTripDashboardService: ActiveTripDashboardService,
    private readonly routeContractLockService: RouteContractLockService,
    private readonly decisionReplayService: ActiveTripDecisionReplayService,
    private readonly trekkingFitnessBackflow: TrekkingFitnessBackflowService,
  ) {}

  @Public()
  @Get(':tripId/active')
  @ApiOperation({
    summary: 'PRD 3.12 — Active Trip Dashboard 聚合视图',
    description:
      '一次返回 contextualCards、crewDnaPanel、协同任务、Rollback 提案、Route Contract Lock；需为协作者。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getActiveTripDashboard(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.activeTripDashboardService.getActiveTripDashboard(user.userId, tripId);
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
  @Get(':tripId/collaborative-tasks')
  @ApiOperation({
    summary: 'PRD 3.13 — 行中协同任务列表',
    description: '读取 Trip.metadata.collaborativeTaskFlywheel；需为行程协作者。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listCollaborativeTasks(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.flywheelService.listCollaborativeTasks(user.userId, tripId);
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
  @Post(':tripId/collaborative-tasks/:taskId/events')
  @ApiOperation({
    summary: 'PRD 3.13 — 协同任务行为捕获',
    description: 'confirm / rollback / ack_timeout → 更新任务状态并异步触发 Decision DNA 进化。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async recordCollaborativeTaskEvent(
    @Param('tripId') tripId: string,
    @Param('taskId') taskId: string,
    @Body() dto: CollaborativeTaskEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.flywheelService.recordCollaborativeTaskEvent(
        user.userId,
        tripId,
        taskId,
        {
          action: dto.action,
          note: dto.note,
          evidenceRefs: dto.evidenceRefs,
          fitnessSubjectUserId: dto.fitnessSubjectUserId,
        },
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
  @Get(':tripId/decision-events')
  @ApiOperation({
    summary: 'PRD 3.12 — 行中 Decision 学习环状态',
    description: '返回 pendingRollback 提案与 eventLog；需为行程协作者。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getDecisionState(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.activeTripDecisionService.getDecisionState(user.userId, tripId);
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
  @Post(':tripId/decision-events')
  @ApiOperation({
    summary: 'PRD 3.12 — 路线 Rollback 决策事件',
    description:
      'route_rollback: propose（队长）→ confirm（队员）→ 全员确认后 DNA；protest（队员异议）→ 负样本 DNA。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async recordDecisionEvent(
    @Param('tripId') tripId: string,
    @Body() dto: TripDecisionEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.activeTripDecisionService.recordDecisionEvent(user.userId, tripId, dto);
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
  @Get(':tripId/route-contract-lock')
  @ApiOperation({ summary: 'PRD 3.12 Phase 3 — Route Contract Lock 状态' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getRouteContractLock(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.routeContractLockService.getRouteContractLock(user.userId, tripId);
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
  @Post(':tripId/route-contract-lock/authorize')
  @ApiOperation({ summary: 'PRD 3.12 Phase 3 — Vault 里程碑资金授权' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async authorizeRouteContract(
    @Param('tripId') tripId: string,
    @Body() dto: AuthorizeRouteContractDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.routeContractLockService.authorizeVaultMilestones(user.userId, tripId, dto);
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
  @Post(':tripId/route-contract-lock/reorder')
  @ApiOperation({
    summary: 'PRD 3.12 Phase 3 — 队长 rollback 里程碑顺序',
    description: '仅 full_managed 队长；Contract 未全员锁定前可用。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async reorderRouteContract(
    @Param('tripId') tripId: string,
    @Body() dto: ReorderRouteContractDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.routeContractLockService.reorderVaultMilestones(user.userId, tripId, dto);
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
  @Get(':tripId/decision-replay')
  @ApiOperation({
    summary: 'PRD 3.12 — Active Trip 决策 Replay（Abu 叙事）',
    description:
      '聚合协同任务 / Rollback / Vault 事件为可回放时间线与 Abu 归因叙事。' +
      '若存在 collab_flywheel_audit_snapshots，附加 flywheelAuditReport（预测 vs 观测 fingerprint 对撞）。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getDecisionReplay(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.decisionReplayService.getDecisionReplay(user.userId, tripId);
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
  @Get(':tripId/template-backflow/preview')
  @ApiOperation({
    summary: 'PRD 3.11/3.12 — 行后轨迹脱敏回流 Route Template 预览',
    description: '只读预览；不写 DB。供路线模板范例库人工审核后入库。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async previewTemplateBackflow(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.decisionReplayService.previewTemplateBackflow(user.userId, tripId);
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
  @Post(':tripId/template-backflow/commit')
  @ApiOperation({
    summary: 'PRD 3.11/3.12 — 行后轨迹脱敏回流 Route Template 提交',
    description:
      '仅队长；将 anonymized 范例写入 RouteTemplate.metadata.matchSquareBackflow_v1.examples。幂等：Trip.metadata.matchSquareTemplateBackflowCommit。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async commitTemplateBackflow(
    @Param('tripId') tripId: string,
    @Body() body: CommitTemplateBackflowDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.decisionReplayService.commitTemplateBackflow(user.userId, tripId, {
        note: body.note,
        skipIfExists: body.skipIfExists,
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
  @Post(':tripId/physical-fitness-events')
  @ApiOperation({
    summary: 'PRD 3.14 — 行后体能负反馈',
    description:
      '记录 Rollback / 下撤 / 救援等体能风控事件，调低 subjectUserId 的 trekking_fitness_baseline 并异步触发 Decision DNA。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async recordPhysicalFitnessEvent(
    @Param('tripId') tripId: string,
    @Body() dto: PhysicalFitnessEventDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.trekkingFitnessBackflow.recordPhysicalFailureEvent({
        tripId,
        subjectUserId: dto.subjectUserId,
        reporterUserId: user.userId,
        eventType: dto.eventType,
        evidenceLabel: dto.evidenceLabel,
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
}
