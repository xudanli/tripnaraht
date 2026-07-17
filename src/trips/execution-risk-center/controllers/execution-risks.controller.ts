import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Headers,
  Res,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import type { Response } from 'express';
import type {
  AcknowledgeExecutionRiskDto,
  ActiveRiskType,
  ConfirmExecutionRiskApplyRequestDto,
  ExecutionRiskApplyRequestDto,
  ExecutionRiskListQuery,
  RiskAcknowledgementStatus,
  RiskLevel,
  RiskLifecycleStatus,
  RiskTreatmentStatus,
} from '../types/execution-risk.types';
import { ActiveRiskAggregationService } from '../services/active-risk-aggregation.service';
import { ExecutionRiskSummaryService } from '../services/execution-risk-summary.service';
import { ExecutionRiskUserStateService } from '../services/execution-risk-user-state.service';
import { ExecutionRiskRecommendationService } from '../services/execution-risk-recommendation.service';
import { ExecutionRiskApplyService } from '../services/execution-risk-apply.service';
import { ExecutionAdjustmentQueueProjectionService } from '../services/execution-adjustment-queue-projection.service';
import { ExecutionAdjustmentQueueContextService } from '../services/execution-adjustment-queue-context.service';
import { resolveRiskById } from '../utils/risk-merge.util';
import { ExecutionRiskShadowCompareService } from '../services/execution-risk-shadow-compare.service';
import { ExecutionRiskShadowMetricsService } from '../services/execution-risk-shadow-metrics.service';
import {
  isExecutionRiskShadowCompareEnabled,
  readExecutionRiskFeatureFlags,
  resolveExecutionRiskCutoverMode,
} from '../config/execution-risk-feature-flags.util';
import { AttentionPrimarySsoCutoverService } from '../../guardian-decision-core/attention/attention-primary-sso-cutover.service';
import { projectActiveRiskDetailWithUserFacing } from '../utils/execution-risk-detail.projection.util';

@ApiTags('trip-execution-risks')
@Public()
@Controller('trips/:tripId/execution-risks')
export class ExecutionRisksController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly aggregation: ActiveRiskAggregationService,
    private readonly summary: ExecutionRiskSummaryService,
    private readonly userState: ExecutionRiskUserStateService,
    private readonly recommendations: ExecutionRiskRecommendationService,
    private readonly apply: ExecutionRiskApplyService,
    private readonly adjustmentQueue: ExecutionAdjustmentQueueProjectionService,
    private readonly adjustmentQueueContext: ExecutionAdjustmentQueueContextService,
    private readonly shadowCompare: ExecutionRiskShadowCompareService,
    private readonly shadowMetrics: ExecutionRiskShadowMetricsService,
    @Optional() private readonly primarySsoCutover?: AttentionPrimarySsoCutoverService,
  ) {}

  @Get('adjustment-queue')
  @ApiOperation({ summary: '待调整事项（Execution Risk Center 投影）' })
  async getAdjustmentQueue(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const ctx = await this.adjustmentQueueContext.load(tripId);
      const data = await this.adjustmentQueue.getAdjustmentQueue(tripId, userId, ctx);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('summary')
  @ApiOperation({ summary: '今日执行风险概览' })
  @ApiQuery({ name: 'date', required: false })
  async getSummary(
    @Param('tripId') tripId: string,
    @Query('date') date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      return successResponse(await this.summary.getSummary(tripId, userId, date));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('shadow-compare')
  @ApiOperation({ summary: 'Legacy vs Canonical shadow comparison (Phase 1 cutover)' })
  async getShadowCompare(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const result = await this.shadowCompare.compareForTrip(tripId, userId);
      return successResponse({
        ...result.comparison,
        build: result.build,
        clusterVisibilityConsistency: result.clusterVisibilityConsistency,
        cutoverMode: resolveExecutionRiskCutoverMode(),
        shadowCompareEnabled: isExecutionRiskShadowCompareEnabled(),
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('shadow-metrics')
  @ApiOperation({ summary: 'In-process Legacy shadow compare metrics snapshot' })
  async getShadowMetrics() {
    return successResponse({
      flags: readExecutionRiskFeatureFlags(),
      metrics: this.shadowMetrics.snapshot(),
      recent: this.shadowMetrics.recent(5),
    });
  }

  @Get()
  @ApiOperation({ summary: '活跃风险列表（统一 Read Model）' })
  @ApiQuery({ name: 'lifecycleStatus', required: false })
  @ApiQuery({ name: 'acknowledgementStatus', required: false })
  @ApiQuery({ name: 'treatmentStatus', required: false })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'date', required: false })
  async listRisks(
    @Param('tripId') tripId: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
    @Query('acknowledgementStatus') acknowledgementStatus?: string,
    @Query('treatmentStatus') treatmentStatus?: string,
    @Query('level') level?: string,
    @Query('type') type?: string,
    @Query('date') _date?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const query: ExecutionRiskListQuery = {
        lifecycleStatus: parseCsv<RiskLifecycleStatus>(lifecycleStatus),
        acknowledgementStatus: parseCsv<RiskAcknowledgementStatus>(acknowledgementStatus),
        treatmentStatus: parseCsv<RiskTreatmentStatus>(treatmentStatus),
        level: parseCsv<RiskLevel>(level),
        type: parseCsv<ActiveRiskType>(type),
        date: _date,
      };
      const items = await this.aggregation.listRisks(tripId, userId, query);
      return successResponse({ tripId, items, count: items.length, generatedAt: new Date().toISOString() });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':riskId')
  @ApiOperation({ summary: '风险详情' })
  @ApiParam({ name: 'riskId', description: '统一 riskId' })
  async getRisk(
    @Param('tripId') tripId: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const risk = await this.aggregation.getRisk(tripId, riskId, userId);
      if (!risk) {
        throw new NotFoundException(`风险 ${riskId} 不存在`);
      }
      const cutoverPlan =
        (await this.primarySsoCutover?.loadCutoverPlan(tripId).catch(() => null)) ?? null;
      return successResponse(projectActiveRiskDetailWithUserFacing(risk, { cutoverPlan }));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':riskId/acknowledge')
  @ApiOperation({ summary: '确认已阅读（仅更新用户状态）' })
  async acknowledge(
    @Param('tripId') tripId: string,
    @Param('riskId') riskId: string,
    @Body() body: AcknowledgeExecutionRiskDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const risks = await this.aggregation.listRisks(tripId, userId);
      const risk = resolveRiskById(risks, riskId);
      if (!risk) {
        throw new NotFoundException(`风险 ${riskId} 不存在`);
      }
      const state = await this.userState.acknowledge(tripId, risk.riskKey, userId, {
        snoozeUntil: body.snoozeUntil,
      });
      return successResponse({
        riskId,
        riskKey: risk.riskKey,
        lifecycleStatus: risk.lifecycleStatus,
        acknowledgementStatus: state.snoozedUntil ? 'SNOOZED' : 'ACKNOWLEDGED',
        treatmentStatus: risk.treatmentStatus,
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':riskId/recommendations')
  @ApiOperation({ summary: '风险关联建议' })
  async listRecommendations(
    @Param('tripId') tripId: string,
    @Param('riskId') riskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const items = await this.recommendations.listForRisk(tripId, riskId, userId);
      return successResponse({ riskId, items, count: items.length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':riskId/recommendations/:recommendationId/apply')
  @ApiOperation({
    summary: '采用建议（写回 Active Plan；write-chain 开启时为预览）',
  })
  async applyRecommendation(
    @Param('tripId') tripId: string,
    @Param('riskId') riskId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: ExecutionRiskApplyRequestDto,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.apply.applyRecommendation(tripId, riskId, recommendationId, userId, {
        idempotencyKey: idempotencyHeader ?? body.idempotencyKey,
        request: body,
      });
      if (data.idempotentReplay) {
        res.setHeader('X-Idempotent', 'true');
      }
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':riskId/recommendations/:recommendationId/confirm')
  @ApiOperation({ summary: '确认采用建议（门禁开启时写 PlanVersion + Ledger）' })
  async confirmRecommendation(
    @Param('tripId') tripId: string,
    @Param('riskId') riskId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: ConfirmExecutionRiskApplyRequestDto,
    @Headers('idempotency-key') idempotencyHeader: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.apply.confirmRecommendation(
        tripId,
        riskId,
        recommendationId,
        userId,
        body.confirm === true,
        {
          idempotencyKey: idempotencyHeader ?? body.idempotencyKey,
          confirmedBy: body.confirmedBy ?? userId,
          expectedPlanVersionId: body.expectedPlanVersionId,
        },
      );
      if (data.idempotentReplay) {
        res.setHeader('X-Idempotent', 'true');
      }
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      const res = e.getResponse();
      const payload = typeof res === 'string' ? { message: res } : (res as Record<string, unknown>);
      const msg = String(payload.message ?? e.message);
      const code = String(payload.code ?? ErrorCode.BAD_REQUEST);
      return errorResponse(code as ErrorCode, msg);
    }
    if (e instanceof ConflictException) {
      const res = e.getResponse();
      const payload = typeof res === 'string' ? { message: res } : (res as Record<string, unknown>);
      return errorResponse(
        String(payload.code ?? 'IDEMPOTENCY_CONFLICT') as ErrorCode,
        String(payload.message ?? e.message),
      );
    }
    throw e;
  }
}

function parseCsv<T extends string>(value?: string): T[] | undefined {
  if (!value?.trim()) return undefined;
  return value.split(',').map((s) => s.trim()) as T[];
}
