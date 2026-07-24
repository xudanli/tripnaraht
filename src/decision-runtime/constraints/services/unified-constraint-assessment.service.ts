/**
 * Unified Constraint Assessment — merge planning + executability lanes per constraintKey.
 */

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeasibilityReportService } from '../../../trips/trip-constraint-solver/services/feasibility-report.service';
import { TripConstraintRegistryService } from '../../../trips/trip-constraint-solver/services/trip-constraint-registry.service';
import { TRIP_CONSTRAINT_LEGACY_IDS } from '../../../trips/trip-constraint-solver/types/trip-constraint.types';
import { phase0AssessmentConstraintKeys } from '../../../trips/trip-constraint-solver/utils/constraint-validator-registry.util';
import { resolveConstraintCapability } from '../../../trips/trip-constraint-solver/utils/constraint-capability-registry.util';
import { ExecutabilityAssessmentService } from '../../../trips/tep/services/executability-assessment.service';
import { DecisionProblemCollectorService } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import { feasibilityIssuesToAssessments } from '../adapters/feasibility-issue-to-assessment.adapter';
import { tepRuleResultsToAssessments } from '../adapters/tep-rule-result-to-assessment.adapter';
import type { UnifiedConstraintAssessmentBundle } from '../contracts/unified-constraint-assessment.types';
import { resolveEvaluationContextVersion } from '../utils/evaluation-context-version.util';
import { feasibilityStatusToAggregate } from '../utils/aggregate-status-resolver.util';
import { linkAssessmentsToProblems } from '../adapters/decision-problem-assessment-link.util';
import {
  buildUnifiedConstraintAssessmentBundle,
  formatContractRequirement,
} from '../utils/unified-constraint-assessment.builder';

const LEGACY_ID_BY_KEY: Record<string, string> = {
  MAX_DAILY_DRIVE: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
  NO_NIGHT_DRIVE: TRIP_CONSTRAINT_LEGACY_IDS.NO_NIGHT_DRIVE,
  OFFICIAL_IS_FROAD_2WD: 'c_official_is_froad_2wd',
  NO_UNPAVED_ROAD: 'c_tpl_no_unpaved_road',
  FIXED_APPOINTMENTS: 'c_tpl_fixed_appointments',
  PRODUCT_SESSION_TIME_WINDOW: 'c_tpl_product_session_time_window',
  MEETING_POINT_BUFFER: 'c_tpl_meeting_point_buffer',
  PRODUCT_PARTICIPANT_ELIGIBILITY: 'c_tpl_product_participant_eligibility',
  PRODUCT_WEATHER_DEPENDENCY: 'c_tpl_product_weather_dependency',
};

@Injectable()
export class UnifiedConstraintAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feasibility: FeasibilityReportService,
    private readonly constraintRegistry: TripConstraintRegistryService,
    private readonly executability: ExecutabilityAssessmentService,
    @Optional() private readonly problemCollector?: DecisionProblemCollectorService,
  ) {}

  async buildBundle(
    tripId: string,
    options?: { refresh?: boolean; userId?: string },
  ): Promise<UnifiedConstraintAssessmentBundle> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true, updatedAt: true, destination: true },
    });
    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    const generatedAt = new Date().toISOString();
    const contextVersion = resolveEvaluationContextVersion({
      tripId,
      metadata: trip.metadata,
      updatedAt: trip.updatedAt,
      countryCode: trip.destination,
    });

    const userId =
      options?.userId ??
      (process.env.NODE_ENV !== 'production' ? 'anonymous-dev-user' : 'system');

    const [report, tepLane, constraintList] = await Promise.all([
      options?.refresh
        ? this.feasibility.validate(tripId, {})
        : this.feasibility.getReport(tripId),
      this.executability.getTepOnlyPlanningRuleResults(tripId, {
        refresh: options?.refresh,
      }),
      this.constraintRegistry.list(tripId, userId, {}),
    ]);

    const problems = this.problemCollector
      ? (await this.problemCollector.collect(tripId)).items.map((d) => d)
      : [];

    const evaluatedAt = report.verifiedAt ?? tepLane.evaluatedAt ?? generatedAt;

    let planningAssessments = feasibilityIssuesToAssessments(report.issues, {
      tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion,
      evaluatedAt,
    });

    const tepAssessments = tepRuleResultsToAssessments(tepLane.ruleResults, {
      tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion,
      evaluatedAt,
      dailyDrivePlans: tepLane.dailyDrivePlans,
      itemLabelsById: tepLane.itemLabelsById,
    });

    planningAssessments = linkAssessmentsToProblems(planningAssessments, problems);
    const linkedTepAssessments = linkAssessmentsToProblems(tepAssessments, problems);

    const constraintByKey = new Map(
      constraintList.items.map((c) => {
        const cap = resolveConstraintCapability(c);
        return [cap.constraintKey, c] as const;
      }),
    );

    const constraintMeta: Record<
      string,
      { legacyConstraintId?: string; contractRequirement?: string }
    > = {};
    for (const key of phase0AssessmentConstraintKeys()) {
      const constraint = constraintByKey.get(key);
      constraintMeta[key] = {
        legacyConstraintId: constraint?.id ?? LEGACY_ID_BY_KEY[key],
        contractRequirement: formatContractRequirement(key, constraint?.value),
      };
    }

    return buildUnifiedConstraintAssessmentBundle({
      tripId,
      generatedAt,
      contextVersion,
      evaluatedAt,
      planVersionRef: tepLane.planVersionRef,
      planningAssessments,
      tepAssessments: linkedTepAssessments,
      constraintMeta,
    });
  }
}

export { feasibilityStatusToAggregate };
