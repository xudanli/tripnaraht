import {
  Controller,
  Get,
  Param,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { PlanningConflictsService } from '../services/planning-conflicts.service';
import { DecisionCheckerService } from '../services/decision-checker.service';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';

@ApiTags('planning-conflicts')
@Public()
@Controller('trips/:tripId')
export class PlanningConflictsController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly planningConflicts: PlanningConflictsService,
    private readonly decisionChecker: DecisionCheckerService,
  ) {}

  @Get('planning-conflicts')
  @ApiOperation({
    summary: 'Plan Studio 冲突中心聚合（feasibility + schedule）',
    description:
      'M2 BFF：合并 feasibility-report.issues 与 GET /conflicts。includeDecisionChecker=1 时先返 conflicts，decisionChecker 异步补全（poll decisionCheckerTaskId）',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'decisionCheckerTaskId',
    required: false,
    description: '异步补全决策检查器时轮询；就绪后响应附带 decisionChecker',
  })
  async getPlanningConflicts(
    @Param('tripId') tripId: string,
    @Query('includeConstraintsSummary') includeConstraintsSummary?: string,
    @Query('includeDecisionChecker') includeDecisionChecker?: string,
    @Query('focusConflictId') focusConflictId?: string,
    @Query('decisionCheckerTaskId') decisionCheckerTaskId?: string,
    @Query('constraintsVersion') constraintsVersion?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);

      const includeSummary =
        includeConstraintsSummary === '1' || includeConstraintsSummary === 'true';
      const includeDeferred =
        includeDecisionChecker === '1' || includeDecisionChecker === 'true';
      const parsedVersion = this.parseConstraintsVersion(constraintsVersion);
      const trimmedFocus = focusConflictId?.trim() || undefined;
      const trimmedTaskId = decisionCheckerTaskId?.trim();

      if (trimmedTaskId) {
        const deferred = this.decisionChecker.getPlanningDeferred(trimmedTaskId, tripId);
        if (!deferred) {
          throw new BadRequestException('decisionCheckerTaskId expired or invalid');
        }
        const data = this.attachDeferredDecisionChecker(
          { ...deferred.planningResponse },
          trimmedTaskId,
          deferred,
        );
        return successResponse(data);
      }

      const loadOpts = {
        includeConstraintsSummary: includeSummary,
        skipConstraintsSummary: includeDeferred,
      };

      if (includeDeferred) {
        const activePending = this.decisionChecker.findActivePendingPlanningDeferred(tripId);
        if (activePending) {
          const data = { ...activePending.entry.planningResponse };
          data.decisionCheckerDeferred = this.decisionChecker.buildDeferredPollMeta(
            tripId,
            activePending.taskId,
            activePending.entry.status,
            activePending.entry.error,
          );
          return successResponse(data);
        }

        const revisionKey = await this.planningConflicts.resolveRevisionKey(tripId);
        const cached = this.planningConflicts.getCachedArtifacts(tripId, revisionKey);
        if (cached) {
          const { taskId, pollUrl } = this.decisionChecker.startPlanningDeferred(
            tripId,
            cached.response,
            cached.report,
            {
              focusConflictId: trimmedFocus,
              constraintsVersion: parsedVersion,
            },
          );
          const data = { ...cached.response };
          data.decisionCheckerDeferred = this.decisionChecker.buildDeferredPollMeta(
            tripId,
            taskId,
            'pending',
          );
          return successResponse(data);
        }

        const stale = this.planningConflicts.getStaleCachedArtifacts(tripId);
        const fastArtifacts =
          stale ??
          (await this.planningConflicts.loadArtifactsFast(tripId));

        const { taskId } = this.decisionChecker.startPlanningDeferredWithFullRefresh(
          tripId,
          fastArtifacts,
          loadOpts,
          {
            focusConflictId: trimmedFocus,
            constraintsVersion: parsedVersion,
          },
        );
        const data = { ...fastArtifacts.response };
        if (!stale) {
          data.isStale = true;
        }
        data.decisionCheckerDeferred = this.decisionChecker.buildDeferredPollMeta(
          tripId,
          taskId,
          'pending',
        );
        return successResponse(data);
      }

      const artifacts = await this.planningConflicts.loadArtifacts(tripId, loadOpts);
      const data = artifacts.response;

      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  private attachDeferredDecisionChecker(
    data: PlanningConflictsResponse,
    taskId: string,
    deferred: NonNullable<ReturnType<DecisionCheckerService['getPlanningDeferred']>>,
  ): PlanningConflictsResponse {
    const effectiveStatus =
      deferred.decisionChecker != null ? ('ready' as const) : deferred.status;
    data.decisionCheckerDeferred = this.decisionChecker.buildDeferredPollMeta(
      data.tripId,
      taskId,
      effectiveStatus,
      deferred.error,
    );
    if (deferred.decisionChecker) {
      data.decisionChecker = deferred.decisionChecker;
      if (deferred.decisionChecker.daySplits?.length) {
        data.daySplits = deferred.decisionChecker.daySplits;
      }
    }
    return data;
  }

  private parseConstraintsVersion(raw?: string): number | undefined {
    if (raw == null || raw === '') return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new BadRequestException('constraintsVersion must be a number');
    }
    return n;
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
