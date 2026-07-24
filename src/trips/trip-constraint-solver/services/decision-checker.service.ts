/**
 * 规划工作台 · 决策检查器 BFF 聚合服务
 */

import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomBytes } from 'crypto';
import { PlanningConflictsService } from './planning-conflicts.service';
import { FeasibilityReportService } from './feasibility-report.service';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { TripConstraintPreviewService } from './trip-constraint-preview.service';
import { SplitPlanService } from './split-plan.service';
import {
  DecisionCheckerDeferredStore,
  DECISION_CHECKER_DEFERRED_POLL_INTERVAL_MS,
  type PlanningDecisionCheckerDeferredTask,
} from './decision-checker-deferred.store';
import type {
  DecisionCheckerQuery,
  DecisionCheckerRefreshBody,
  DecisionCheckerRefreshResponse,
  DecisionCheckerResponse,
} from '../types/decision-checker.types';
import { projectDecisionCheckerResponse } from '../utils/decision-checker-view.projection.util';
import { projectTransportConstraintForBff } from '../utils/constraints-summary.util';
import { CoverageMapService } from '../../readiness/services/coverage-map.service';
import type { FeasibilityIssueDto, TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import type { PlanningConflictItem, PlanningConflictsResponse } from '../types/planning-conflicts.types';
import type { PlanningConflictsArtifacts, PlanningConflictsLoadOpts } from './planning-conflicts.service';
import { isDecisionCheckerChangePreviewEnabled } from '../../../decision-runtime/decision-problems/decision-problem-ssot.config';
import { resolveDecisionCheckerProblemId } from '../utils/decision-checker-option-preview.util';
import type { UnifiedDecisionActionPreviewView } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

const DECISION_CHECKER_PREVIEW_USER = 'decision-checker-preview';
const MAX_OPTION_PREVIEWS = 3;

interface DecisionCheckerBuildContext {
  planningResponse: PlanningConflictsResponse;
  report: TripFeasibilityReportDto;
}

interface DecisionCheckerBuildOpts {
  /** 跳过 assessTrip / repair-options 等重路径（deferred & fast GET） */
  lightweight?: boolean;
}

const DEFERRED_BUILD_TIMEOUT_MS = 8_000;

@Injectable()
export class DecisionCheckerService {
  private readonly logger = new Logger(DecisionCheckerService.name);
  private readonly deferredStore = new DecisionCheckerDeferredStore();

  constructor(
    private readonly planningConflicts: PlanningConflictsService,
    @Inject(forwardRef(() => FeasibilityReportService))
    private readonly feasibility: FeasibilityReportService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    private readonly preview: TripConstraintPreviewService,
    private readonly splitPlans: SplitPlanService,
    private readonly coverageMap: CoverageMapService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async getDecisionChecker(tripId: string, query?: DecisionCheckerQuery): Promise<DecisionCheckerResponse> {
    const taskId = query?.taskId?.trim();
    if (taskId) {
      const deferred = this.deferredStore.get(taskId);
      if (deferred && deferred.tripId === tripId) {
        this.syncDeferredEntryStatus(deferred);
        return deferred.promise;
      }
    }

    const ctx = await this.resolveDecisionCheckerBuildContext(tripId);
    return this.buildDecisionChecker(tripId, query, ctx, { lightweight: true });
  }

  /**
   * planning-conflicts 首包后异步补全决策检查器；复用已算好的 conflicts + report。
   */
  startPlanningDeferred(
    tripId: string,
    planningResponse: PlanningConflictsResponse,
    report: TripFeasibilityReportDto,
    query?: Pick<DecisionCheckerQuery, 'focusConflictId' | 'constraintsVersion'>,
  ): { taskId: string; pollUrl: string } {
    const taskId = `dc_embed_${randomBytes(6).toString('hex')}`;
    const focusConflictId = query?.focusConflictId?.trim() || undefined;
    const pollUrl = this.buildPlanningPollUrl(tripId, taskId);

    const promise = this.buildDecisionChecker(
      tripId,
      {
        focusConflictId,
        constraintsVersion: query?.constraintsVersion,
        taskId,
      },
      {
        planningResponse,
        report,
      },
      { lightweight: true },
    );

    const entry: PlanningDecisionCheckerDeferredTask = {
      tripId,
      createdAt: Date.now(),
      focusConflictId,
      planningResponse,
      report,
      status: 'pending',
      promise,
    };

    promise
      .then((decisionChecker) => {
        entry.decisionChecker = decisionChecker;
        entry.status = 'ready';
      })
      .catch((e: unknown) => {
        entry.status = 'failed';
        entry.error = e instanceof Error ? e.message : String(e);
      });

    this.deferredStore.put(taskId, entry);
    return { taskId, pollUrl };
  }

  /**
   * deferred 首包用 fast artifacts 立即构建 decisionChecker；全量 conflicts 后台刷新 planningResponse。
   */
  startPlanningDeferredWithFullRefresh(
    tripId: string,
    fastArtifacts: PlanningConflictsArtifacts,
    loadOpts: PlanningConflictsLoadOpts | undefined,
    query?: Pick<DecisionCheckerQuery, 'focusConflictId' | 'constraintsVersion'>,
  ): { taskId: string; pollUrl: string; reused?: boolean } {
    const existing = this.deferredStore.findActivePendingForTrip(tripId);
    if (existing) {
      this.syncDeferredEntryStatus(existing.entry);
      return {
        taskId: existing.taskId,
        pollUrl: this.buildPlanningPollUrl(tripId, existing.taskId),
        reused: true,
      };
    }

    const taskId = `dc_embed_${randomBytes(6).toString('hex')}`;
    const focusConflictId = query?.focusConflictId?.trim() || undefined;
    const pollUrl = this.buildPlanningPollUrl(tripId, taskId);

    const entry: PlanningDecisionCheckerDeferredTask = {
      tripId,
      createdAt: Date.now(),
      focusConflictId,
      planningResponse: fastArtifacts.response,
      report: fastArtifacts.report,
      status: 'pending',
      promise: Promise.resolve({} as DecisionCheckerResponse),
    };

    const promise = this.buildDecisionChecker(
      tripId,
      {
        focusConflictId,
        constraintsVersion: query?.constraintsVersion,
        taskId,
      },
      {
        planningResponse: fastArtifacts.response,
        report: fastArtifacts.report,
      },
      { lightweight: true },
    );

    entry.promise = promise;

    promise
      .then((decisionChecker) => {
        entry.decisionChecker = decisionChecker;
        entry.status = 'ready';
        this.logger.debug(`deferred ${taskId} ready for trip ${tripId}`);
      })
      .catch((e: unknown) => {
        entry.status = 'failed';
        entry.error = e instanceof Error ? e.message : String(e);
        this.logger.warn(`deferred ${taskId} failed for trip ${tripId}: ${entry.error}`);
      });

    this.deferredStore.put(taskId, entry);

    void this.refreshPlanningArtifactsInBackground(tripId, loadOpts, entry);

    return { taskId, pollUrl };
  }

  getPlanningDeferred(taskId: string, tripId: string): PlanningDecisionCheckerDeferredTask | undefined {
    const entry = this.deferredStore.get(taskId);
    if (!entry || entry.tripId !== tripId) return undefined;
    this.syncDeferredEntryStatus(entry);
    return entry;
  }

  findActivePendingPlanningDeferred(
    tripId: string,
  ): { taskId: string; entry: PlanningDecisionCheckerDeferredTask } | undefined {
    return this.deferredStore.findActivePendingForTrip(tripId);
  }

  buildDeferredPollMeta(
    tripId: string,
    taskId: string,
    status: PlanningDecisionCheckerDeferredTask['status'],
    error?: string,
  ): import('../types/planning-conflicts.types').DecisionCheckerDeferredDto {
    return {
      status,
      taskId,
      pollUrl: this.buildPlanningPollUrl(tripId, taskId),
      ...(error ? { error } : {}),
      ...(status === 'pending' ? { pollIntervalMs: DECISION_CHECKER_DEFERRED_POLL_INTERVAL_MS } : {}),
    };
  }

  async refreshDecisionChecker(
    tripId: string,
    body: DecisionCheckerRefreshBody,
  ): Promise<DecisionCheckerRefreshResponse> {
    await this.feasibility.validate(tripId, {
      runMonteCarlo: body.runMonteCarlo,
      forceRefreshEvidence: body.runMonteCarlo ? true : undefined,
    });

    const taskId = `dc_refresh_${randomBytes(6).toString('hex')}`;
    return {
      taskId,
      pollUrl: `/trips/${tripId}/decision-checker?taskId=${taskId}&focusConflictId=${body.focusConflictId ?? ''}`,
    };
  }

  private async buildDecisionChecker(
    tripId: string,
    query?: DecisionCheckerQuery,
    ctx?: DecisionCheckerBuildContext,
    opts?: DecisionCheckerBuildOpts,
  ): Promise<DecisionCheckerResponse> {
    const generatedAt = new Date().toISOString();
    void opts?.lightweight;

    const planningResp = ctx?.planningResponse;
    const report = ctx?.report;

    const changePreview = isDecisionCheckerChangePreviewEnabled();

    const [planningConflicts, feasibilityReport, constraintsSummary, assessSummary, appliedSplitPlanIds, scheduleContext, coverageMap] =
      await Promise.all([
        planningResp
          ? Promise.resolve(planningResp)
          : this.planningConflicts.getPlanningConflicts(tripId),
        report ? Promise.resolve(report) : this.feasibility.getReport(tripId),
        this.withOptionalTimeout(
          this.constraintsSummary.getSummary(tripId, {
            teamFitSummary: report?.teamFitSummary,
          }),
          DEFERRED_BUILD_TIMEOUT_MS,
          'constraintsSummary',
        ).catch(() => ({
          tripId,
          constraintsVersion: 0,
          confirmedAt: null,
          confirmedBy: null,
          isUserConfirmed: false,
          isVersionConfirmed: false,
          allReady: false,
          pendingCount: 0,
          timeRange: { startDate: null, endDate: null, dayCount: 0, status: 'missing' as const },
          budget: { total: null, currency: 'CNY', status: 'missing' as const },
          travelers: { count: 0, memberCount: 0, profilingCompletedCount: 0, status: 'missing' as const },
          transport: projectTransportConstraintForBff({
            travelMode: null,
            transportHint: null,
            status: 'missing',
          }),
          pendingItems: [],
        })),
        changePreview
          ? Promise.resolve(undefined)
          : this.withOptionalTimeout(
              this.preview.captureAssessSummary(tripId),
              DEFERRED_BUILD_TIMEOUT_MS,
              'captureAssessSummary',
            ).catch(() => undefined),
        this.splitPlans.getAppliedSplitPlanIds(tripId),
        this.splitPlans.getScheduleContext(tripId),
        this.withOptionalTimeout(this.coverageMap.getCoverageMap(tripId), DEFERRED_BUILD_TIMEOUT_MS, 'getCoverageMap').catch(
          () => undefined,
        ),
      ]);

    const { primaryIssue, focusConflictId } = this.resolveFocusIssue(
      feasibilityReport.issues,
      planningConflicts.conflicts,
      query?.focusConflictId,
    );

    const optionPreviews = changePreview
      ? await this.loadOptionPreviews(tripId, {
          focusConflictId,
          primaryIssue,
          planningConflicts: planningConflicts.conflicts,
        })
      : undefined;

    let repairOptions: Awaited<ReturnType<FeasibilityReportService['getRepairOptions']>> | undefined;
    if (primaryIssue && !changePreview) {
      try {
        repairOptions = await this.withOptionalTimeout(
          this.feasibility.getRepairOptions(tripId, primaryIssue.id),
          DEFERRED_BUILD_TIMEOUT_MS,
          'getRepairOptions',
        );
      } catch {
        // projection 层 resolveEffectiveRepairOptions 兜底（含 daily_drive 合成候选）
      }
    }

    const stale = this.resolveStale({
      reportIsStale: feasibilityReport.isStale,
      queryConstraintsVersion: query?.constraintsVersion,
      currentConstraintsVersion: constraintsSummary.constraintsVersion,
      includeStale: query?.includeStale,
    });

    const completenessScore = feasibilityReport.itineraryCompletenessSummary?.score;
    const experienceCompletionDelta =
      typeof completenessScore === 'number' ? Math.round(completenessScore - 100) : undefined;

    return projectDecisionCheckerResponse({
      tripId,
      generatedAt,
      focusConflictId,
      isStale: stale.isStale,
      staleReason: stale.staleReason,
      constraintsSummary,
      report: feasibilityReport,
      planningConflicts: planningConflicts.conflicts,
      primaryIssue,
      repairOptions,
      assessScoreDelta: assessSummary
        ? Math.round(assessSummary.overallAverageScore - feasibilityReport.overallScore)
        : undefined,
      experienceCompletionDelta,
      appliedSplitPlanIds,
      schedule: scheduleContext.schedule,
      coveragePois: coverageMap?.pois,
      coverageCalculatedAt: coverageMap?.calculatedAt,
      evaluationMode: changePreview ? 'CHANGE_PREVIEW' : 'PLAN_VERIFY',
      optionPreviews,
    });
  }

  private async loadOptionPreviews(
    tripId: string,
    input: {
      focusConflictId?: string;
      primaryIssue?: FeasibilityIssueDto;
      planningConflicts: PlanningConflictItem[];
    },
  ): Promise<UnifiedDecisionActionPreviewView[] | undefined> {
    const readModel = this.getUnifiedReadModel();
    if (!readModel) return undefined;

    const primaryConflict = input.planningConflicts.find(
      (c) => c.id === input.focusConflictId,
    ) ?? input.planningConflicts[0];

    const problemId = resolveDecisionCheckerProblemId({
      focusConflictId: input.focusConflictId,
      planningConflictId: primaryConflict?.id,
      issue: input.primaryIssue ?? primaryConflict?.issue,
    });
    if (!problemId) return undefined;

    try {
      const options = await readModel.getProblemOptions(tripId, problemId);
      const previews: UnifiedDecisionActionPreviewView[] = [];
      for (const action of options.actions.slice(0, MAX_OPTION_PREVIEWS)) {
        try {
          const preview = await readModel.previewAction(
            tripId,
            problemId,
            action.actionId,
            DECISION_CHECKER_PREVIEW_USER,
          );
          previews.push(preview);
        } catch (e: unknown) {
          this.logger.debug(
            `option preview skipped action=${action.actionId}: ${e instanceof Error ? e.message : e}`,
          );
        }
      }
      return previews.length ? previews : undefined;
    } catch (e: unknown) {
      this.logger.warn(
        `CHANGE_PREVIEW load failed problem=${problemId}: ${e instanceof Error ? e.message : e}`,
      );
      return undefined;
    }
  }

  private getUnifiedReadModel():
    | {
        getProblemOptions: (tripId: string, problemId: string) => Promise<{ actions: Array<{ actionId: string }> }>;
        previewAction: (
          tripId: string,
          problemId: string,
          actionId: string,
          userId: string,
        ) => Promise<UnifiedDecisionActionPreviewView>;
      }
    | undefined {
    try {
      const { UnifiedDecisionProblemReadModelService } = require('../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service') as {
        UnifiedDecisionProblemReadModelService: new (...args: never[]) => {
          getProblemOptions: (tripId: string, problemId: string) => Promise<{ actions: Array<{ actionId: string }> }>;
          previewAction: (
            tripId: string,
            problemId: string,
            actionId: string,
            userId: string,
          ) => Promise<UnifiedDecisionActionPreviewView>;
        };
      };
      return this.moduleRef.get(UnifiedDecisionProblemReadModelService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private buildPlanningPollUrl(tripId: string, taskId: string): string {
    return `/trips/${tripId}/planning-conflicts?decisionCheckerTaskId=${taskId}`;
  }

  /** poll 时若 decisionChecker 已算完但 status 未同步，补标 ready */
  private syncDeferredEntryStatus(entry: PlanningDecisionCheckerDeferredTask): void {
    if (entry.status === 'pending' && entry.decisionChecker) {
      entry.status = 'ready';
    }
  }

  /** 优先 cache / fast artifacts，避免同步 GET 触发全量 getConflicts + coverage */
  private async resolveDecisionCheckerBuildContext(
    tripId: string,
  ): Promise<DecisionCheckerBuildContext> {
    const revisionKey = await this.planningConflicts.resolveRevisionKey(tripId);
    const cached = this.planningConflicts.getCachedArtifacts(tripId, revisionKey);
    if (cached) {
      return { planningResponse: cached.response, report: cached.report };
    }
    const fast = await this.planningConflicts.loadArtifactsFast(tripId);
    void this.planningConflicts.loadArtifacts(tripId, { skipConstraintsSummary: true });
    return { planningResponse: fast.response, report: fast.report };
  }

  private refreshPlanningArtifactsInBackground(
    tripId: string,
    loadOpts: PlanningConflictsLoadOpts | undefined,
    entry: PlanningDecisionCheckerDeferredTask,
  ): void {
    void this.planningConflicts
      .loadArtifacts(tripId, loadOpts)
      .then((full) => {
        entry.planningResponse = full.response;
        entry.report = full.report;
      })
      .catch(() => {
        // decisionChecker 已 ready；全量 conflicts 刷新失败不降级 DC
      });
  }

  private withOptionalTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  }

  private resolveFocusIssue(
    issues: FeasibilityIssueDto[],
    planningConflicts: PlanningConflictItem[],
    focusConflictId?: string,
  ): { primaryIssue?: FeasibilityIssueDto; focusConflictId?: string } {
    if (focusConflictId) {
      const byId = issues.find((i) => i.id === focusConflictId);
      if (byId) return { primaryIssue: byId, focusConflictId };
      const byPlanning = planningConflicts.find((c) => c.id === focusConflictId);
      if (byPlanning?.issue) return { primaryIssue: byPlanning.issue, focusConflictId };
    }

    const hardPlanning = planningConflicts.find((c) => c.priority === 'must_handle');
    if (hardPlanning?.issue) {
      return { primaryIssue: hardPlanning.issue, focusConflictId: hardPlanning.id };
    }

    const hardIssue = issues.find((i) => i.priority === 'must_handle');
    if (hardIssue) return { primaryIssue: hardIssue, focusConflictId: hardIssue.id };

    const first = planningConflicts[0]?.issue ?? issues[0];
    return {
      primaryIssue: first,
      focusConflictId: planningConflicts[0]?.id ?? first?.id,
    };
  }

  private resolveStale(input: {
    reportIsStale: boolean;
    queryConstraintsVersion?: number;
    currentConstraintsVersion: number;
    includeStale?: boolean;
  }): { isStale?: boolean; staleReason?: string } {
    if (input.queryConstraintsVersion != null && input.queryConstraintsVersion !== input.currentConstraintsVersion) {
      return {
        isStale: true,
        staleReason: `constraintsVersion mismatch: expected ${input.queryConstraintsVersion}, current ${input.currentConstraintsVersion}`,
      };
    }
    if (input.reportIsStale) {
      return {
        isStale: true,
        staleReason: 'feasibility report snapshot is stale',
      };
    }
    if (input.includeStale) {
      return { isStale: true, staleReason: 'includeStale requested' };
    }
    return {};
  }
}
