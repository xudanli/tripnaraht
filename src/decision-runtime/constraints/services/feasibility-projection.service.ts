/**
 * FeasibilityProjectionService — Gateway PLAN_VERIFY → FeasibilityIssue projection.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ConflictDto } from '../../../trips/dto/trip-conflicts.dto';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import { mapConflictToFeasibilityIssue } from '../../../trips/trip-constraint-solver/utils/feasibility-assembler.util';
import { splitConflictsByScheduleDomain } from '../../../trips/trip-constraint-solver/utils/schedule-domain.util';
import { PreTripReadinessP0Service } from '../../../trips/trip-constraint-solver/services/pre-trip-readiness-p0.service';
import { isConstraintGatewayPlanVerifyProjectionEnabled } from '../constraint-plan-verify.config';
import { isPlanObjectGatewayEvaluationEnabled } from '../../plan-objects/plan-object.config';
import { ConflictType } from '../../../trips/dto/trip-conflicts.dto';
import { PoiAccessConstraintProvider } from '../providers/poi-access-constraint.provider';
import { ScheduleConstraintProvider } from '../providers/schedule-constraint.provider';
import { GuardianFeasibilityCollectorService } from './guardian-feasibility-collector.service';
import { PlanObjectConstraintProvider } from '../providers/plan-object-constraint.provider';
import { gatewayReportToFeasibilityIssues } from '../adapters/assertion-to-feasibility-issue.adapter';
import { guardianAssertionsToFeasibilityIssues } from '../adapters/guardian-assertion-to-feasibility-issue.adapter';
import { buildFeasibilityIssueDedupeKey } from '../../../trips/trip-constraint-solver/utils/feasibility-issue-dedup.util';
import type { CanonicalConstraintReport } from '../contracts/canonical-constraint-report';

export interface FeasibilityProjectionResult {
  domainIssues: FeasibilityIssueDto[];
  nonDomainIssues: FeasibilityIssueDto[];
  gatewayReport?: CanonicalConstraintReport;
  projectionApplied: boolean;
}

export interface ScheduleConflictProjectionResult {
  nonScheduleConflicts: ConflictDto[];
  scheduleIssues: FeasibilityIssueDto[];
  projectionApplied: boolean;
  gatewayReport?: CanonicalConstraintReport;
}

@Injectable()
export class FeasibilityProjectionService {
  private readonly logger = new Logger(FeasibilityProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preTripP0: PreTripReadinessP0Service,
    @Optional() private readonly poiAccessProvider?: PoiAccessConstraintProvider,
    @Optional() private readonly scheduleProvider?: ScheduleConstraintProvider,
    @Optional() private readonly guardianCollector?: GuardianFeasibilityCollectorService,
    @Optional() private readonly planObjectProvider?: PlanObjectConstraintProvider,
  ) {}

  isProjectionEnabled(): boolean {
    return isConstraintGatewayPlanVerifyProjectionEnabled();
  }

  /**
   * When PLAN_VERIFY projection is on, POI access BLOCK/WARNING issues come from gateway provider path.
   * Experience-regret and other non-access P0 issues remain on legacy assembly.
   */
  async projectP0Issues(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }): Promise<FeasibilityProjectionResult> {
    const legacyIssues = await this.preTripP0.buildP0Issues(trip);
    if (!this.isProjectionEnabled() || !this.poiAccessProvider) {
      return {
        domainIssues: legacyIssues.filter((i) => this.isPoiAccessDomain(i)),
        nonDomainIssues: legacyIssues.filter((i) => !this.isPoiAccessDomain(i)),
        projectionApplied: false,
      };
    }

    try {
      const assertions = await this.poiAccessProvider.evaluateForTrip(trip);
      const legacyAccess = legacyIssues.filter((i) => this.isPoiAccessDomain(i));
      const preserveByAssertionId = new Map<string, FeasibilityIssueDto>();
      for (const issue of legacyAccess) {
        preserveByAssertionId.set(`feas_${issue.id}`, issue);
      }

      const domainIssues = gatewayReportToFeasibilityIssues(assertions, preserveByAssertionId);
      const nonDomainIssues = legacyIssues.filter((i) => !this.isPoiAccessDomain(i));

      const gatewayReport: CanonicalConstraintReport = {
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: trip.id,
        evaluatedAt: new Date().toISOString(),
        assertions,
        completeness: {
          roads: 'MISSING',
          weather: 'MISSING',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        overallStatus: assertions.some((a) => a.status === 'BLOCK')
          ? 'INFEASIBLE'
          : assertions.some((a) => a.status === 'WARNING' || a.status === 'REQUIRES_VERIFICATION')
            ? 'CONDITIONALLY_FEASIBLE'
            : 'FEASIBLE',
        degraded: false,
        degradedReasons: [],
        evaluationMode: 'PLAN_VERIFY',
      };

      return { domainIssues, nonDomainIssues, gatewayReport, projectionApplied: true };
    } catch (e: unknown) {
      this.logger.warn(
        `PLAN_VERIFY projection fallback to legacy P0: ${e instanceof Error ? e.message : e}`,
      );
      return {
        domainIssues: legacyIssues.filter((i) => this.isPoiAccessDomain(i)),
        nonDomainIssues: legacyIssues.filter((i) => !this.isPoiAccessDomain(i)),
        projectionApplied: false,
      };
    }
  }

  /**
   * When PLAN_VERIFY projection is on, schedule-domain conflicts (daily_drive, travel timing, buffer)
   * are evaluated via ScheduleConstraintProvider and projected back to FeasibilityIssueDto.
   */
  projectScheduleConflicts(tripId: string, conflicts: ConflictDto[]): ScheduleConflictProjectionResult {
    const inputConflicts = isPlanObjectGatewayEvaluationEnabled()
      ? conflicts.filter(
          (c) =>
            c.type !== ConflictType.LUNCH_WINDOW &&
            c.type !== ConflictType.BUFFER_INSUFFICIENT &&
            c.type !== ConflictType.FATIGUE_EXCEEDED &&
            !c.id.startsWith('lunch-window-') &&
            !c.id.startsWith('buffer-insufficient-') &&
            !c.id.startsWith('fatigue-exceeded-'),
        )
      : conflicts;
    const { schedule, nonSchedule } = splitConflictsByScheduleDomain(inputConflicts);
    const legacyScheduleIssues = schedule.map((c) =>
      mapConflictToFeasibilityIssue(c, { tripId }),
    );

    if (!this.isProjectionEnabled() || !this.scheduleProvider || schedule.length === 0) {
      return {
        nonScheduleConflicts: conflicts,
        scheduleIssues: legacyScheduleIssues,
        projectionApplied: false,
      };
    }

    try {
      const assertions = this.scheduleProvider.evaluateConflicts(tripId, conflicts);
      const preserveByAssertionId = new Map<string, FeasibilityIssueDto>();
      for (const issue of legacyScheduleIssues) {
        preserveByAssertionId.set(`feas_${issue.id}`, issue);
      }

      const scheduleIssues = gatewayReportToFeasibilityIssues(assertions, preserveByAssertionId);
      const gatewayReport: CanonicalConstraintReport = {
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId,
        evaluatedAt: new Date().toISOString(),
        assertions,
        completeness: {
          roads: 'MISSING',
          weather: 'MISSING',
          hazards: 'MISSING',
          ferries: 'MISSING',
          openingHours: 'MISSING',
        },
        overallStatus: assertions.some((a) => a.status === 'BLOCK')
          ? 'INFEASIBLE'
          : assertions.some((a) => a.status === 'WARNING' || a.status === 'REQUIRES_VERIFICATION')
            ? 'CONDITIONALLY_FEASIBLE'
            : 'FEASIBLE',
        degraded: false,
        degradedReasons: [],
        evaluationMode: 'PLAN_VERIFY',
      };

      return {
        nonScheduleConflicts: nonSchedule,
        scheduleIssues,
        gatewayReport,
        projectionApplied: true,
      };
    } catch (e: unknown) {
      this.logger.warn(
        `Schedule PLAN_VERIFY projection fallback to legacy: ${e instanceof Error ? e.message : e}`,
      );
      return {
        nonScheduleConflicts: conflicts,
        scheduleIssues: legacyScheduleIssues,
        projectionApplied: false,
      };
    }
  }

  /**
   * Phase 4 — PlanObject day assessments (STAY / MEAL_WINDOW / TRANSFER load) → FeasibilityIssue.
   */
  async projectPlanObjectIssues(tripId: string): Promise<FeasibilityIssueDto[]> {
    if (!this.isProjectionEnabled() || !this.planObjectProvider?.isEnabled()) return [];

    try {
      const assertions = await this.planObjectProvider.evaluateForTrip(tripId);
      return gatewayReportToFeasibilityIssues(assertions);
    } catch (e: unknown) {
      this.logger.warn(
        `PlanObject PLAN_VERIFY projection skipped: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  /**
   * Supplemental Guardian BLOCK/WARNING issues from RFC-001 workspaces (road close, weather, etc.).
   * Skips semantic keys already covered by POI / schedule gateway projections.
   */
  async projectGuardianIssues(
    tripId: string,
    existingIssues: FeasibilityIssueDto[],
  ): Promise<FeasibilityIssueDto[]> {
    if (!this.isProjectionEnabled() || !this.guardianCollector) return [];

    try {
      const existingSemanticKeys = new Set(
        existingIssues.map((i) => i.semanticKey ?? buildFeasibilityIssueDedupeKey(i)),
      );
      const assertions = await this.guardianCollector.collectCanonicalAssertions(tripId);
      const supplemental = this.guardianCollector.filterSupplementalAssertions(
        assertions,
        existingSemanticKeys,
      );
      return guardianAssertionsToFeasibilityIssues(supplemental);
    } catch (e: unknown) {
      this.logger.warn(
        `Guardian PLAN_VERIFY projection skipped: ${e instanceof Error ? e.message : e}`,
      );
      return [];
    }
  }

  /** Expose raw gateway assertions for trace / tests */
  async planVerifyAssertionsForTrip(tripId: string): Promise<CanonicalConstraintReport | null> {
    if (!this.isProjectionEnabled() || !this.poiAccessProvider) return null;
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, status: true, startDate: true, metadata: true },
    });
    if (!trip) return null;
    const assertions = await this.poiAccessProvider.evaluateForTrip(trip);
    return {
      schemaId: 'tripnara.canonical_constraint_report@v1',
      tripId,
      evaluatedAt: new Date().toISOString(),
      assertions,
      completeness: {
        roads: 'MISSING',
        weather: 'MISSING',
        hazards: 'MISSING',
        ferries: 'MISSING',
        openingHours: 'MISSING',
      },
      overallStatus: assertions.some((a) => a.status === 'BLOCK') ? 'INFEASIBLE' : 'FEASIBLE',
      degraded: false,
      degradedReasons: [],
      evaluationMode: 'PLAN_VERIFY',
    };
  }

  private isPoiAccessDomain(issue: FeasibilityIssueDto): boolean {
    return (
      issue.category === 'access_capacity' ||
      issue.issueKind?.startsWith('poi_access') === true ||
      Boolean(issue.visitorAccess)
    );
  }
}

/** Merge helper for feasibility assembler call sites */
export function mergeProjectedP0Issues(projection: FeasibilityProjectionResult): FeasibilityIssueDto[] {
  return [...projection.domainIssues, ...projection.nonDomainIssues];
}
