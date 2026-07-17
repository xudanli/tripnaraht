/**
 * RFC-002 — Unified Decision API (frontend single contract).
 */

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Delete,
  Res,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { DecisionEngineGatewayService } from '../services/decision-engine-gateway.service';
import { buildPlanVersionIdempotencyKey } from '../../../trips/guardian-decision-core/plan-version/plan-version.service';
import { DecisionProblemPreferenceRoundService } from '../../../trips/process-fairness/services/decision-problem-preference-round.service';
import { SubmitResolutionBodyDto } from '../dto/submit-resolution-body.dto';
import { CreateCollaborativeSubTaskBodyDto } from '../dto/create-collaborative-subtask-body.dto';
import { UpdateCollaborativeSubTaskBodyDto } from '../dto/update-collaborative-subtask-body.dto';
import { normalizeSubmitResolutionRequest } from '../utils/normalize-submit-resolution-request.util';

class AuthorizeBodyDto {
  choice?: string;
}

class WeatherPollBodyDto {
  dayIndex!: number;
  runFull?: boolean;
}

class DailyLoadScanBodyDto {
  runFull?: boolean;
}

@ApiTags('unified-decision')
@Public()
@Controller('trips/:tripId')
export class UnifiedDecisionController {
  constructor(
    private readonly gateway: DecisionEngineGatewayService,
    private readonly access: ConstraintSolverAccessService,
    private readonly problemPreferenceRound: DecisionProblemPreferenceRoundService,
  ) {}

  @Get('decision-center')
  @ApiOperation({ summary: 'RFC-002 Unified Decision Center (Gateway aggregate)' })
  async getDecisionCenter(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.getDecisionCenter(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems')
  @ApiOperation({ summary: 'RFC-002 Unified problem list (canonical + legacy, deduped)' })
  async listProblems(
    @Param('tripId') tripId: string,
    @Query('includeDebug') includeDebug?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.listProblems(tripId, {
        includeDebug: includeDebug === 'true' || includeDebug === '1',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-opportunities')
  @ApiOperation({
    summary:
      'Decision opportunity inbox (未过门槛候选；默认不进决策空间队列)',
  })
  async listOpportunities(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.listDecisionOpportunities(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-opportunities/:opportunityId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upgrade opportunity → published DecisionCase（加入比较）' })
  async publishOpportunity(
    @Param('tripId') tripId: string,
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.publishDecisionOpportunity(tripId, opportunityId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems/:problemId')
  @ApiOperation({ summary: 'RFC-002 Unified problem detail (routed by Gateway)' })
  async getProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Query('focusConflictId') focusConflictId?: string,
    @Query('includeDebug') includeDebug?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const data = await this.gateway.getProblem(tripId, problemId, {
        userId,
        focusConflictId,
        includeDebug: includeDebug === 'true' || includeDebug === '1',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems/:problemId/causal-trace')
  @ApiOperation({ summary: 'Canonical Causal Trace v1 replay (technical + narrative projection)' })
  async getCausalTrace(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.getCausalTraceReplay(tripId, problemId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems/:problemId/options')
  @ApiOperation({ summary: 'RFC-002 Unified options (canonical candidates or legacy repair)' })
  async getOptions(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Query('includeDebug') includeDebug?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.getOptions(tripId, problemId, {
        includeDebug: includeDebug === 'true' || includeDebug === '1',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/options/:optionId/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Unified option preview (routed by Gateway)' })
  async previewOption(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Param('optionId') optionId: string,
    @Query('includeDebug') includeDebug?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const data = await this.gateway.previewOption(tripId, problemId, optionId, userId, {
        includeDebug: includeDebug === 'true' || includeDebug === '1',
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/preference-round')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '从决策问题创建/绑定结构化协商轮次（幂等：同领域已有进行中轮次则复用）',
  })
  async ensurePreferenceRoundForProblem(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const data = await this.problemPreferenceRound.ensurePreferenceRoundForProblem(
        tripId,
        userId,
        problemId,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/resolutions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phase 3 — 提交决策结论（DECIDED，不写入时间轴）' })
  async submitResolution(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: SubmitResolutionBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const data = await this.gateway.submitResolution(
        tripId,
        problemId,
        userId,
        normalizeSubmitResolutionRequest(body),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/collaborative-sub-tasks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Phase 3 — 创建决策问题协作跟进子任务（绑定 resolutionId）' })
  async createCollaborativeSubTask(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: CreateCollaborativeSubTaskBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const data = await this.gateway.createCollaborativeSubTask(tripId, problemId, userId, body);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems/:problemId/collaborative-sub-tasks')
  @ApiOperation({ summary: 'Phase 3 — 列出决策问题协作跟进子任务' })
  async listCollaborativeSubTasks(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Query('resolutionId') resolutionId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.listCollaborativeSubTasks(tripId, problemId, resolutionId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('decision-problems/:problemId/collaborative-sub-tasks/:subTaskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phase 3 — 更新协作跟进子任务状态/指派人' })
  async updateCollaborativeSubTask(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Param('subTaskId') subTaskId: string,
    @Body() body: UpdateCollaborativeSubTaskBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.updateCollaborativeSubTask(
        tripId,
        problemId,
        subTaskId,
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Delete('decision-problems/:problemId/collaborative-sub-tasks/:subTaskId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Phase 3 — 删除协作跟进子任务' })
  async deleteCollaborativeSubTask(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Param('subTaskId') subTaskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.deleteCollaborativeSubTask(tripId, problemId, subTaskId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/apply')
  @ApiOperation({
    summary: 'Phase 3 — 应用已提交决策（Plan Gate / 时间轴写入）',
    description:
      '默认同步 200。加 ?async=1 返回 202 + taskId，轮询 GET .../apply-tasks/:taskId 直至 READY。',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async applyResolution(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Query('async') asyncFlag: string | undefined,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      const useAsync = asyncFlag === '1' || asyncFlag === 'true';
      if (useAsync) {
        res.status(HttpStatus.ACCEPTED);
        const data = await this.gateway.startApplyResolutionAsync(tripId, problemId, userId);
        return successResponse(data);
      }
      const data = await this.gateway.applyResolution(tripId, problemId, userId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-problems/:problemId/apply-tasks/:taskId')
  @ApiOperation({ summary: '轮询异步 apply 任务（execute + revalidation）' })
  async getApplyTask(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Param('taskId') taskId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = this.gateway.getApplyTask(tripId, problemId, taskId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decision-problems/:problemId/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Evaluate + finalize (Canonical Runtime)' })
  async evaluate(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.evaluate(tripId, problemId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decisions/:decisionId/authorize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 L2 authorize (Canonical Runtime Phase 1)' })
  async authorize(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: AuthorizeBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.authorize({
        tripId,
        decisionId,
        choice: body.choice,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decisions/:decisionId/execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Execute PlanVersion (Canonical Runtime Phase 1)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async execute(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.execute({
        tripId,
        decisionId,
        idempotencyKey:
          idempotencyKey ?? buildPlanVersionIdempotencyKey(tripId, decisionId),
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decisions/:decisionId/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Rollback (Canonical Runtime Phase 1)' })
  async rollback(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.rollback(tripId, decisionId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('weather-hazard/poll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Poll live weather for trip day (Canonical Slice 2)' })
  async pollWeatherHazard(
    @Param('tripId') tripId: string,
    @Body() body: WeatherPollBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.pollWeatherHazard(
        tripId,
        body.dayIndex,
        body.runFull,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('daily-load/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RFC-002 Scan plan for excessive daily driving load (Canonical Slice 3)' })
  async scanDailyLoad(
    @Param('tripId') tripId: string,
    @Body() body: DailyLoadScanBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.scanDailyLoad(tripId, body.runFull);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-routes')
  @ApiOperation({ summary: 'RFC-002 Route lineage audit (debug / ops)' })
  async listRoutes(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      const data = await this.gateway.listRouteLineage(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(tripId: string, user?: CurrentUserPayload): Promise<void> {
    const userId = this.access.resolveUserId(user);
    await this.access.assertTripMember(tripId, userId);
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
      const resp = e.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : typeof resp === 'object' && resp !== null && 'message' in resp
            ? String((resp as { message?: string | string[] }).message)
            : e.message;
      const details =
        typeof resp === 'object' && resp !== null && 'details' in resp
          ? (resp as { details?: Record<string, unknown> }).details
          : undefined;
      return errorResponse(ErrorCode.VALIDATION_ERROR, message, details);
    }
    throw e;
  }
}
