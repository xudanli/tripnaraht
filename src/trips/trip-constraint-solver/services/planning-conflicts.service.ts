/**
 * Plan Studio 冲突中心 BFF — feasibility-report + schedule conflicts 聚合
 */

import { Injectable } from '@nestjs/common';
import { TripConflictsService } from '../../services/trip-conflicts.service';
import { FeasibilityReportService } from './feasibility-report.service';
import type { PlanningConflictsResponse } from '../types/planning-conflicts.types';
import {
  assemblePlanningConflicts,
  buildPlanningConflictsSummary,
} from '../utils/planning-conflicts.util';
import { ConstraintsSummaryService } from './constraints-summary.service';

@Injectable()
export class PlanningConflictsService {
  constructor(
    private readonly feasibility: FeasibilityReportService,
    private readonly conflicts: TripConflictsService,
    private readonly constraintsSummary: ConstraintsSummaryService,
  ) {}

  async getPlanningConflicts(
    tripId: string,
    opts?: { includeConstraintsSummary?: boolean },
  ): Promise<PlanningConflictsResponse> {
    const conflictsGeneratedAt = new Date().toISOString();

    const [report, conflictsResp] = await Promise.all([
      this.feasibility.getReport(tripId),
      this.conflicts.getConflicts(tripId),
    ]);

    const merged = assemblePlanningConflicts({
      tripId,
      issues: report.issues,
      scheduleConflicts: conflictsResp.conflicts,
    });

    return {
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
      ...(opts?.includeConstraintsSummary
        ? { constraintsSummary: await this.constraintsSummary.getSummary(tripId) }
        : {}),
    };
  }
}
