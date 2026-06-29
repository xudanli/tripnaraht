/**
 * Plan Studio 冲突中心 BFF — feasibility-report + schedule conflicts 聚合
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { FeasibilityReportService } from './feasibility-report.service';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';
import {
  assemblePlanningConflicts,
  buildPlanningConflictsSummary,
} from '../utils/planning-conflicts.util';
import { ConstraintsSummaryService } from './constraints-summary.service';
import { SplitPlanService } from './split-plan.service';
import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import { PlanningConflictsCacheStore } from './planning-conflicts-cache.store';
import { resolveTripRevision, revisionToString } from '../utils/trip-revision.util';

export interface PlanningConflictsArtifacts {
  response: PlanningConflictsResponse;
  report: TripFeasibilityReportDto;
}

export interface PlanningConflictsLoadOpts {
  includeConstraintsSummary?: boolean;
  /** includeDecisionChecker 时跳过同步 summary，首包只返 conflicts + deferred */
  skipConstraintsSummary?: boolean;
}

@Injectable()
export class PlanningConflictsService {
  private readonly cache = new PlanningConflictsCacheStore();
  private readonly inFlightFullLoad = new Map<string, Promise<PlanningConflictsArtifacts>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly feasibility: FeasibilityReportService,
    private readonly conflicts: TripConflictsService,
    private readonly constraintsSummary: ConstraintsSummaryService,
    private readonly splitPlans: SplitPlanService,
  ) {}

  async resolveRevisionKey(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) return `${tripId}:missing`;
    return revisionToString(resolveTripRevision(trip));
  }

  getCachedArtifacts(tripId: string, revisionKey: string): PlanningConflictsArtifacts | undefined {
    return this.cache.get(tripId, revisionKey);
  }

  getStaleCachedArtifacts(tripId: string): PlanningConflictsArtifacts | undefined {
    return this.cache.getStale(tripId);
  }

  /** deferred 首包：启发式 schedule conflicts + 轻量 feasibility，通常 <2s */
  async loadArtifactsFast(tripId: string): Promise<PlanningConflictsArtifacts> {
    const conflictsGeneratedAt = new Date().toISOString();
    const conflictsPromise = this.conflicts.getConflicts(tripId, undefined, undefined, {
      useRouteApi: false,
    });
    const [conflictsResp, report] = await Promise.all([
      conflictsPromise,
      this.feasibility.getReportFast(tripId, {
        preloadedConflictsPromise: conflictsPromise,
        conflictsQuery: { useRouteApi: false },
      }),
    ]);

    const merged = assemblePlanningConflicts({
      tripId,
      issues: report.issues,
      scheduleConflicts: conflictsResp.conflicts,
    });

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
      summary: buildPlanningConflictsSummary(merged),
      conflicts: merged,
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

    const merged = assemblePlanningConflicts({
      tripId,
      issues: report.issues,
      scheduleConflicts: conflictsResp.conflicts,
    });

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
      summary: buildPlanningConflictsSummary(merged),
      conflicts: merged,
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
}
