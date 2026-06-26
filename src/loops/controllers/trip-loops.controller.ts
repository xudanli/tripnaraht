import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { LoopOrchestratorService } from '../services/loop-orchestrator.service';
import { LoopTriggerService } from '../services/loop-trigger.service';
import { ApplyLoopPatchesDto, StartReadinessRepairLoopDto } from '../dto/readiness-repair-loop.dto';
import {
  ApplyInTripLoopPlansDto,
  StartInTripRecoveryLoopDto,
  TriggerInTripRecoveryLoopDto,
} from '../dto/in-trip-recovery-loop.dto';
import { RunDecisionLearningDto } from '../dto/decision-learning-loop.dto';
import { ReviewLoopEvalCaseDto } from '../dto/loop-eval-approval.dto';

@ApiTags('trip-loops')
@Public()
@Controller('trips/:tripId/loops')
export class TripLoopsController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly orchestrator: LoopOrchestratorService,
    private readonly loopTrigger: LoopTriggerService,
  ) {}

  @Post('readiness-repair')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '运行 Readiness Repair Loop（Blocker → Preview → Validate → 推荐 Patch）',
    description:
      '薄编排层：内部调用 feasibility-report 验证链，持久化 LoopRun/LoopIteration，不直接写库除非后续 apply。响应含 ui 决策闭环视图。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async runReadinessRepair(
    @Param('tripId') tripId: string,
    @Body() body: StartReadinessRepairLoopDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.runReadinessRepair({
        tripId,
        triggerEventId: body?.triggerEventId,
        triggerType: 'MANUAL',
        forceRefreshEvidence: body?.forceRefreshEvidence,
        runMonteCarlo: body?.runMonteCarlo,
        userId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('readiness-repair/latest')
  @ApiOperation({ summary: '获取最近一次 Readiness Repair Loop 的 UI 视图' })
  async getLatestReadinessRepairUi(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.getLatestReadinessRepairUi(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('readiness-repair/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '事件驱动触发 Readiness Repair Loop（带幂等去重）',
    description: '模拟 CONSTRAINT_CHANGED / ITINERARY_CHANGED 等触发源；需 LOOP_AUTO_TRIGGER_ENABLED=true 或 force=true。',
  })
  async triggerReadinessRepair(
    @Param('tripId') tripId: string,
    @Body()
    body: StartReadinessRepairLoopDto & {
      triggerType?: 'CONSTRAINT_CHANGED' | 'ITINERARY_CHANGED' | 'MANUAL';
      externalEventId?: string;
      force?: boolean;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const outcome = await this.loopTrigger.triggerReadinessRepair({
        tripId,
        triggerType: body?.triggerType ?? 'MANUAL',
        triggerEventId: body?.triggerEventId,
        externalEventId: body?.externalEventId,
        userId,
        forceRefreshEvidence: body?.forceRefreshEvidence,
        force: body?.force,
      });
      return successResponse(outcome);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('in-trip-recovery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '运行行中恢复 Loop（Environment Radar → 局部方案 → 验证）',
    description: '要求 TRAVELING + IN_TRIP_EXECUTION_ENABLED；响应含三层 UI（发生了什么/影响/推荐）。',
  })
  async runInTripRecovery(
    @Param('tripId') tripId: string,
    @Body() body: StartInTripRecoveryLoopDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.runInTripRecovery({
        tripId,
        userId,
        triggerEventId: body?.triggerEventId,
        triggerType: 'MANUAL',
        environmentEventId: body?.environmentEventId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('in-trip-recovery/latest')
  @ApiOperation({ summary: '获取最近一次行中恢复 Loop 的 UI 视图' })
  async getLatestInTripRecoveryUi(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.getLatestInTripRecoveryUi(tripId, userId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('in-trip-recovery/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '事件驱动触发行中恢复 Loop（Environment Radar / 晚出发等）' })
  async triggerInTripRecovery(
    @Param('tripId') tripId: string,
    @Body() body: TriggerInTripRecoveryLoopDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const outcome = await this.loopTrigger.triggerInTripRecovery({
        tripId,
        userId,
        triggerType: (body?.triggerType as any) ?? 'MANUAL',
        triggerEventId: body?.triggerEventId,
        externalEventId: body?.externalEventId ?? body?.environmentEventId,
        environmentEventId: body?.environmentEventId,
        force: body?.force,
      });
      return successResponse(outcome);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-learning/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '运行 Decision Learning Loop — 从 LoopRun 物化 Eval Case',
    description: '将已完成 loop 转为 GOLDEN/FAILURE/REGRESSION/EDGE case，写入 generated/loops/',
  })
  async runDecisionLearning(
    @Param('tripId') tripId: string,
    @Body() body: RunDecisionLearningDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.runDecisionLearning({
        tripId,
        loopRunId: body?.loopRunId,
        limit: body?.limit,
        runReplay: body?.runReplay,
        skipExisting: body?.skipExisting,
        userId,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-learning/cases')
  @ApiOperation({ summary: '列出本行程已物化的 Loop Eval Cases' })
  async listEvalCases(
    @Param('tripId') tripId: string,
    @Query('approvalStatus') approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED',
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.listEvalCases(tripId, approvalStatus);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-learning/cases/:caseId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '人工批准 Loop Eval Case（GOLDEN 自动晋升 approved corpus）' })
  async approveEvalCase(
    @Param('tripId') tripId: string,
    @Param('caseId') caseId: string,
    @Body() body: ReviewLoopEvalCaseDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.approveEvalCase(tripId, caseId, userId, body?.note);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-learning/cases/:caseId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '人工拒绝 Loop Eval Case' })
  async rejectEvalCase(
    @Param('tripId') tripId: string,
    @Param('caseId') caseId: string,
    @Body() body: ReviewLoopEvalCaseDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.rejectEvalCase(tripId, caseId, userId, body?.note);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-learning/replay/:caseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '回放单个 Loop Eval Case 并对比期望' })
  async replayEvalCase(
    @Param('tripId') tripId: string,
    @Param('caseId') caseId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.replayEvalCase(caseId, userId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':loopRunId')
  @ApiOperation({ summary: '查询 LoopRun 详情（含 iterations）' })
  async getLoopRun(
    @Param('tripId') tripId: string,
    @Param('loopRunId') loopRunId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.orchestrator.getLoopRun(loopRunId);
      if (data.tripId !== tripId) {
        throw new NotFoundException(`Loop run ${loopRunId} 不属于行程 ${tripId}`);
      }
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':loopRunId/apply-in-trip')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '人工批准后应用行中恢复方案（Environment Radar resolve）',
  })
  async applyInTripPlans(
    @Param('tripId') tripId: string,
    @Param('loopRunId') loopRunId: string,
    @Body() body: ApplyInTripLoopPlansDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      if (!body?.plans?.length) {
        throw new BadRequestException('plans 不能为空');
      }
      const data = await this.orchestrator.applyInTripPlans(tripId, loopRunId, userId, body.plans);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':loopRunId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '人工批准后应用 Loop 推荐的修复 patch',
    description: '委托 feasibility-report apply-repair；写回行程并 re-score。',
  })
  async applyLoopPatches(
    @Param('tripId') tripId: string,
    @Param('loopRunId') loopRunId: string,
    @Body() body: ApplyLoopPatchesDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      if (!body?.patches?.length) {
        throw new BadRequestException('patches 不能为空');
      }
      const data = await this.orchestrator.applyRecommendedPatches(
        tripId,
        loopRunId,
        body.patches,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    const message = e instanceof Error ? e.message : '内部错误';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
