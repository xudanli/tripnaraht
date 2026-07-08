/**
 * Plan Studio 冲突中心 BFF — Decision Problem 规划阶段投影（SSOT）
 */

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { FeasibilityReportService } from './feasibility-report.service';
import type { PlanningConflictsResponse, PlanningConflictItem } from '../types/planning-conflicts.types';
import {
  assemblePlanningConflicts,
  buildPlanningConflictsSummary,
} from '../utils/planning-conflicts.util';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { SplitPlanService } from './split-plan.service';
import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import { PlanningConflictsCacheStore } from './planning-conflicts-cache.store';
import { buildPlanningConflictsCacheKey } from '../utils/planning-conflicts-cache-key.util';
import { applyConstraintsVersionToPlanningConflictsResponse } from '../utils/planning-conflicts-constraints-version.util';
import {
  isPlanningConflictsFromProblemOnlyEnabled,
  shouldUseUnifiedDecisionReadModel,
} from '../../../decision-runtime/decision-problems/decision-problem-ssot.config';
import { TripConstraintRegistryService } from './trip-constraint-registry.service';
import { mergeSoftAdvisoriesIntoPlanningConflicts } from '../utils/soft-constraint-planning.util';

export interface PlanningConflictsArtifacts {
  response: PlanningConflictsResponse;
  report: TripFeasibilityReportDto;
}

export interface PlanningConflictsLoadOpts {
  includeConstraintsSummary?: boolean;
  /** includeDecisionChecker 时跳过同步 summary，首包只返 conflicts + deferred */
  skipConstraintsSummary?: boolean;
  /** 用于合并 SOFT advisory（soft_prefer） */
  userId?: string;
}

@Injectable()
export class PlanningConflictsService {
  private readonly cache = new PlanningConflictsCacheStore();
  private readonly inFlightFullLoad = new Map<string, Promise<PlanningConflictsArtifacts>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => FeasibilityReportService))
    private readonly feasibility: FeasibilityReportService,
    private readonly conflicts: TripConflictsService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    @Inject(forwardRef(() => SplitPlanService))
    private readonly splitPlans: SplitPlanService,
    private readonly moduleRef: ModuleRef,
    @Inject(forwardRef(() => TripConstraintRegistryService))
    private readonly constraintRegistry: TripConstraintRegistryService,
  ) {}

  async resolveRevisionKey(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) return `${tripId}:missing`;
    return buildPlanningConflictsCacheKey(trip);
  }

  getCachedArtifacts(tripId: string, revisionKey: string): PlanningConflictsArtifacts | undefined {
    return this.cache.get(tripId, revisionKey);
  }

  getStaleCachedArtifacts(tripId: string): PlanningConflictsArtifacts | undefined {
    return this.cache.getStale(tripId);
  }

  invalidateCache(tripId: string): void {
    this.cache.clear(tripId);
  }

  /** deferred 首包：Decision Problem 投影 + 轻量 feasibility verdict */
  async loadArtifactsFast(tripId: string, opts?: PlanningConflictsLoadOpts): Promise<PlanningConflictsArtifacts> {
    const conflictsGeneratedAt = new Date().toISOString();
    const report = await this.feasibility.getReportFast(tripId, {
      conflictsQuery: { useRouteApi: false },
    });

    const merged = await this.resolvePlanningConflictItems(tripId, report);
    const withSoft = await this.mergeSoftAdvisories(tripId, opts?.userId, merged);

    const daySplits = await this.splitPlans.projectDaySplits(tripId, { report, lightweight: true });

    const response: PlanningConflictsResponse = {
      tripId,
      verdict: {
        status: report.verdict.status,
        headline: report.verdict.headline,
      },
      gateExecute: report.gateExecute,
      canStartExecute: report.canStartExecute,
      isStale: true,
      reportVerifiedAt: report.verifiedAt,
      conflictsGeneratedAt,
      summary: buildPlanningConflictsSummary(withSoft),
      conflicts: withSoft,
      ...(daySplits?.length ? { daySplits } : {}),
    };

    return { response, report };
  }

  async loadArtifacts(
    tripId: string,
    opts?: PlanningConflictsLoadOpts,
  ): Promise<PlanningConflictsArtifacts> {
    const revisionKey = await this.resolveRevisionKey(tripId);
    const cached = this.cache.get(tripId, revisionKey);
    if (cached) return cached;

    const inFlightKey = `${tripId}:${revisionKey}`;
    const existing = this.inFlightFullLoad.get(inFlightKey);
    if (existing) return existing;

    const promise = this.loadArtifactsUncached(tripId, opts, revisionKey);
    this.inFlightFullLoad.set(inFlightKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightFullLoad.delete(inFlightKey);
    }
  }

  private async loadArtifactsUncached(
    tripId: string,
    opts: PlanningConflictsLoadOpts | undefined,
    revisionKey: string,
  ): Promise<PlanningConflictsArtifacts> {
    const conflictsGeneratedAt = new Date().toISOString();

    const conflictsPromise = this.conflicts.getConflicts(tripId);
    const [conflictsResp, report] = await Promise.all([
      conflictsPromise,
      this.feasibility.getReport(tripId, { preloadedConflictsPromise: conflictsPromise }),
    ]);

    const merged = await this.resolvePlanningConflictItems(tripId, report, conflictsResp.conflicts);
    const withSoft = await this.mergeSoftAdvisories(tripId, opts?.userId, merged);

    const includeSummary =
      opts?.includeConstraintsSummary === true && opts?.skipConstraintsSummary !== true;

    const [daySplits, constraintsSummary] = await Promise.all([
      this.splitPlans.projectDaySplits(tripId, { report }),
      includeSummary
        ? this.constraintsSummary.getSummary(tripId, {
            teamFitSummary: report.teamFitSummary,
          })
        : Promise.resolve(undefined),
    ]);

    const response: PlanningConflictsResponse = {
      tripId,
      verdict: {
        status: report.verdict.status,
        headline: report.verdict.headline,
      },
      gateExecute: report.gateExecute,
      canStartExecute: report.canStartExecute,
      isStale: report.isStale,
      reportVerifiedAt: report.verifiedAt,
      conflictsGeneratedAt,
      summary: buildPlanningConflictsSummary(withSoft),
      conflicts: withSoft,
      ...(daySplits?.length ? { daySplits } : {}),
      ...(constraintsSummary ? { constraintsSummary } : {}),
    };

    const artifacts = { response, report };
    this.cache.put(tripId, revisionKey, artifacts);
    return artifacts;
  }

  async getPlanningConflicts(
    tripId: string,
    opts?: PlanningConflictsLoadOpts,
  ): Promise<PlanningConflictsResponse> {
    return (await this.loadArtifacts(tripId, opts)).response;
  }

  async attachConstraintsVersionMeta(
    tripId: string,
    response: PlanningConflictsResponse,
    queryConstraintsVersion?: number,
  ): Promise<PlanningConflictsResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    return applyConstraintsVersionToPlanningConflictsResponse(
      response,
      trip?.metadata,
      queryConstraintsVersion,
    );
  }

  private async mergeSoftAdvisories(
    tripId: string,
    userId: string | undefined,
    conflicts: PlanningConflictItem[],
  ): Promise<PlanningConflictItem[]> {
    if (!userId) return conflicts;
    const soft = await this.constraintRegistry.getSoftConstraintAdvisories(tripId, userId);
    return mergeSoftAdvisoriesIntoPlanningConflicts(conflicts, soft);
  }

  /**
   * SSOT projection when unified read model is available; legacy merge as fallback.
   */
  private async resolvePlanningConflictItems(
    tripId: string,
    report: TripFeasibilityReportDto,
    scheduleConflicts?: import('../../dto/trip-conflicts.dto').ConflictDto[],
  ): Promise<PlanningConflictItem[]> {
    const unifiedConflicts = await this.tryUnifiedSsotProjection(tripId);
    if (unifiedConflicts) {
      return unifiedConflicts;
    }

    if (isPlanningConflictsFromProblemOnlyEnabled()) {
      return [];
    }

    const conflictsResp =
      scheduleConflicts !== undefined
        ? { conflicts: scheduleConflicts }
        : await this.conflicts.getConflicts(tripId, undefined, undefined, { useRouteApi: false });

    return assemblePlanningConflicts({
      tripId,
      issues: report.issues,
      scheduleConflicts: conflictsResp.conflicts,
    });
  }

  /**
   * Lazy resolve — avoids static import cycle with UnifiedDecisionProblemReadModelService.
   */
  private async tryUnifiedSsotProjection(tripId: string): Promise<PlanningConflictItem[] | undefined> {
    if (!shouldUseUnifiedDecisionReadModel()) {
      return undefined;
    }
    try {
      const { UnifiedDecisionProblemReadModelService } = await import(
        '../../../decision-runtime/gateway/services/unified-decision-problem-read-model.service'
      );
      const readModel = this.moduleRef.get(UnifiedDecisionProblemReadModelService, { strict: false });
      return (await readModel.projectPlanningConflicts(tripId)).conflicts;
    } catch {
      return undefined;
    }
  }
}
