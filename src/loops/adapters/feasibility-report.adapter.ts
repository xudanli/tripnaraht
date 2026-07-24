import { Injectable, Inject, forwardRef } from '@nestjs/common';
import type { TripFeasibilityReportDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { PreviewRepairResponse, RepairOptionsResponse } from '../../trips/readiness/types/coverage-map.types';
import type { FeasibilityApplyRepairBodyDto, FeasibilityPreviewRepairBodyDto } from '../../trips/trip-constraint-solver/dto/feasibility-report.dto';
import type { ApplyRepairResponse } from '../../trips/readiness/types/coverage-map.types';
import type { ReadinessRepairSnapshot } from '../types/loop-run.types';
import { deriveFeasibilityChecklistFromReport } from '../../trips/trip-constraint-solver/utils/feasibility-checklist.util';

@Injectable()
export class FeasibilityReportAdapter {
  constructor(
    @Inject(
      forwardRef(() =>
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../trips/trip-constraint-solver/services/feasibility-report.service')
          .FeasibilityReportService,
      ),
    )
    private readonly feasibility: import('../../trips/trip-constraint-solver/services/feasibility-report.service').FeasibilityReportService,
  ) {}

  async validateAndSnapshot(
    tripId: string,
    opts?: { forceRefreshEvidence?: boolean; runMonteCarlo?: boolean },
  ): Promise<{ report: TripFeasibilityReportDto; snapshot: ReadinessRepairSnapshot }> {
    const report = opts?.forceRefreshEvidence
      ? await this.feasibility.validate(tripId, {
          forceRefreshEvidence: true,
          runMonteCarlo: opts.runMonteCarlo,
        })
      : await this.feasibility.getReport(tripId);

    return { report, snapshot: this.toSnapshot(report) };
  }

  async getSnapshot(tripId: string): Promise<ReadinessRepairSnapshot> {
    const report = await this.feasibility.getReport(tripId);
    return this.toSnapshot(report);
  }

  async getRepairOptions(tripId: string, issueId: string): Promise<RepairOptionsResponse> {
    return this.feasibility.getRepairOptions(tripId, issueId);
  }

  async previewRepair(
    tripId: string,
    issueId: string,
    body: FeasibilityPreviewRepairBodyDto,
  ): Promise<PreviewRepairResponse> {
    return this.feasibility.previewRepair(tripId, issueId, body);
  }

  async applyRepair(
    tripId: string,
    issueId: string,
    body: FeasibilityApplyRepairBodyDto,
  ): Promise<ApplyRepairResponse> {
    return this.feasibility.applyRepair(tripId, issueId, body);
  }

  async validateScopeForIssue(tripId: string, issueId: string) {
    return this.feasibility.validateScope(tripId, { type: 'issue', issueId });
  }

  listMustHandleIssues(report: TripFeasibilityReportDto) {
    return report.issues.filter((issue) => issue.priority === 'must_handle');
  }

  toSnapshot(report: TripFeasibilityReportDto): ReadinessRepairSnapshot {
    const mustHandle = report.issues.filter((i) => i.priority === 'must_handle');
    const suggestAdjust = report.issues.filter((i) => i.priority === 'suggest_adjust');
    const mc = report.probabilisticAssessment;
    const completionRateP10 =
      mc?.riskMetrics && typeof mc.riskMetrics === 'object'
        ? (mc.riskMetrics as Record<string, unknown>).completionRateP10
        : undefined;

    const checklist = deriveFeasibilityChecklistFromReport(report);

    return {
      readinessScore: report.overallScore,
      hardBlockers: mustHandle.length,
      mustHandleCount: mustHandle.length,
      suggestAdjustCount: suggestAdjust.length,
      canStartExecute: report.canStartExecute,
      verdictStatus: report.verdict.status,
      completionRateP10:
        typeof completionRateP10 === 'number' ? completionRateP10 : mc?.feasibilityProbability,
      checklist,
    };
  }
}
