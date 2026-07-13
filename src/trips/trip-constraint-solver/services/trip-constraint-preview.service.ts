import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { PlanningRuleResult, DailyDrivePlan } from '../../tep/contracts/tep-self-drive.types';
import type { AssessTripResponseDto } from '../../dto/trip-metrics.dto';
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
    @Inject(forwardRef(() => FeasibilityReportService))
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

  async captureTepRuleResults(
    tripId: string,
    options?: { refresh?: boolean },
  ): Promise<
    | {
        ruleResults: PlanningRuleResult[];
        dailyDrivePlans: DailyDrivePlan[];
        itemLabelsById: Map<string, string>;
        evaluatedAt: string;
      }
    | undefined
  > {
    const svc = this.getExecutabilityAssessmentService();
    if (!svc) return undefined;
    try {
      const lane = await svc.getTepOnlyPlanningRuleResults(tripId, options);
      return {
        ruleResults: lane.ruleResults,
        dailyDrivePlans: lane.dailyDrivePlans,
        itemLabelsById: lane.itemLabelsById,
        evaluatedAt: lane.evaluatedAt,
      };
    } catch (e) {
      this.logger.debug(`tep snapshot failed: ${e}`);
      return undefined;
    }
  }

  private getExecutabilityAssessmentService():
    | {
        getTepOnlyPlanningRuleResults: (
          tripId: string,
          options?: { refresh?: boolean },
        ) => Promise<{
          ruleResults: PlanningRuleResult[];
          dailyDrivePlans: DailyDrivePlan[];
          itemLabelsById: Map<string, string>;
          evaluatedAt: string;
        }>;
      }
    | undefined {
    try {
      const { ExecutabilityAssessmentService } =
        require('../../tep/services/executability-assessment.service') as typeof import('../../tep/services/executability-assessment.service');
      return this.moduleRef.get(ExecutabilityAssessmentService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private getTripMetricsService(): TripMetricsServiceLike | undefined {
    try {
      const { TripMetricsService } =
        require('../../services/trip-metrics.service') as typeof import('../../services/trip-metrics.service');
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
