import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { AssessTripResponseDto } from '../../dto/trip-metrics.dto';
import { TripMetricsService } from '../../services/trip-metrics.service';
import type { TripFeasibilityReportDto } from '../types/trip-constraint-solver.types';
import type {
  TripConstraintAssessSummary,
  TripConstraintFeasibilitySnapshot,
} from '../types/trip-constraint.types';
import { FeasibilityReportService } from './feasibility-report.service';

type TripMetricsServiceLike = {
  assessTrip: (tripId: string, dto?: object) => Promise<AssessTripResponseDto>;
};

@Injectable()
export class TripConstraintPreviewService {
  private readonly logger = new Logger(TripConstraintPreviewService.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly feasibility: FeasibilityReportService,
  ) {}

  async captureAssessSummary(tripId: string): Promise<TripConstraintAssessSummary | undefined> {
    const metrics = this.getTripMetricsService();
    if (!metrics) return undefined;
    try {
      const assess = await metrics.assessTrip(tripId);
      return this.toAssessSummary(assess);
    } catch (e) {
      this.logger.debug(`assess snapshot failed: ${e}`);
      return undefined;
    }
  }

  async captureFeasibilitySnapshot(tripId: string): Promise<TripConstraintFeasibilitySnapshot> {
    const report = await this.feasibility.getReport(tripId);
    return this.toFeasibilitySnapshot(report);
  }

  async captureFeasibilityValidateScope(
    tripId: string,
    dayNumber: number,
  ): Promise<TripConstraintFeasibilitySnapshot | undefined> {
    try {
      const report = await this.feasibility.validateScope(tripId, { type: 'day', dayNumber });
      return this.feasibilityFromReport(report);
    } catch (e) {
      this.logger.debug(`validate-scope failed: ${e}`);
      return undefined;
    }
  }

  feasibilityFromReport(report: TripFeasibilityReportDto): TripConstraintFeasibilitySnapshot {
    return this.toFeasibilitySnapshot(report);
  }

  computeExecuteabilityDelta(
    before?: TripConstraintFeasibilitySnapshot,
    after?: TripConstraintFeasibilitySnapshot,
    assessBefore?: TripConstraintAssessSummary,
    assessAfter?: TripConstraintAssessSummary,
  ) {
    if (!before && !after && !assessBefore && !assessAfter) return undefined;
    return {
      scoreDelta:
        assessBefore && assessAfter
          ? assessAfter.overallAverageScore - assessBefore.overallAverageScore
          : undefined,
      mustHandleDelta:
        before && after ? after.mustHandle - before.mustHandle : undefined,
      suggestAdjustDelta:
        before && after ? after.suggestAdjust - before.suggestAdjust : undefined,
    };
  }

  private getTripMetricsService(): TripMetricsServiceLike | undefined {
    try {
      return this.moduleRef.get(TripMetricsService, { strict: false }) as TripMetricsServiceLike;
    } catch {
      return undefined;
    }
  }

  private toAssessSummary(assess: AssessTripResponseDto): TripConstraintAssessSummary {
    return {
      overallAverageScore: assess.overallAverageScore,
      overallGrade: assess.overallGrade,
      reasonableDays: assess.reasonableDays,
      hasIssuesDays: assess.hasIssuesDays,
      plannedDays: assess.plannedDays,
    };
  }

  private toFeasibilitySnapshot(report: TripFeasibilityReportDto): TripConstraintFeasibilitySnapshot {
    const summary = report.summary ?? { mustHandle: 0, suggestAdjust: 0, pendingConfirm: 0 };
    return {
      verdictStatus: report.verdict?.status ?? 'UNKNOWN',
      canStartExecute: report.canStartExecute ?? false,
      mustHandle: summary.mustHandle ?? 0,
      suggestAdjust: summary.suggestAdjust ?? 0,
      pendingConfirm: summary.pendingConfirm ?? 0,
      isStale: report.isStale,
    };
  }
}
