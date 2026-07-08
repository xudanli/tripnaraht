/**
 * Constraint assessment trace aggregation (Phase 1 — read-only, no hot-path behavior change).
 */

import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { FeasibilityReportService } from '../../../trips/trip-constraint-solver/services/feasibility-report.service';
import { TripConstraintRegistryService } from '../../../trips/trip-constraint-solver/services/trip-constraint-registry.service';
import { DecisionProblemCollectorService } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import { enrichPlanningConflictsWithRelatedConstraintIds } from '../../../trips/trip-constraint-solver/utils/constraint-conflict-link.util';
import { feasibilityIssuesToAssessments } from '../adapters/feasibility-issue-to-assessment.adapter';
import {
  findAssessmentsBySemanticKey,
  linkAssessmentsToProblems,
  problemTraceRows,
} from '../adapters/decision-problem-assessment-link.util';
import type { ConstraintAssessmentTraceBundle } from '../contracts/constraint-assessment.types';
import { resolveEvaluationContextVersion } from '../utils/evaluation-context-version.util';

@Injectable()
export class ConstraintAssessmentTraceService {
  private readonly logger = new Logger(ConstraintAssessmentTraceService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly feasibility: FeasibilityReportService,
    private readonly problemCollector: DecisionProblemCollectorService,
    private readonly constraintRegistry: TripConstraintRegistryService,
  ) {}

  isTraceEnabled(): boolean {
    const flag = String(this.config.get<string>('CONSTRAINT_ASSESSMENT_TRACE_ENABLED') ?? 'true').toLowerCase();
    return flag === '1' || flag === 'true';
  }

  async buildTrace(
    tripId: string,
    options?: { semanticKey?: string; userId?: string },
  ): Promise<ConstraintAssessmentTraceBundle> {
    if (!this.isTraceEnabled()) {
      throw new ServiceUnavailableException({
        code: 'CONSTRAINT_TRACE_DISABLED',
        message: 'Set CONSTRAINT_ASSESSMENT_TRACE_ENABLED=true to enable constraint trace API',
      });
    }

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

    const [report, collected] = await Promise.all([
      this.feasibility.getReport(tripId),
      this.problemCollector.collect(tripId),
    ]);

    const policyRefsByIssueId = await this.buildPolicyRefsByIssueId(
      tripId,
      report.issues,
      options?.userId,
    );

    let assessments = feasibilityIssuesToAssessments(report.issues, {
      tripId,
      evaluationMode: 'PLAN_VERIFY',
      contextVersion,
      evaluatedAt: report.verifiedAt ?? generatedAt,
      policyRefsByIssueId,
    });

    const problems = collected.items.map((d) => d);
    assessments = linkAssessmentsToProblems(assessments, problems);

    if (options?.semanticKey?.trim()) {
      assessments = findAssessmentsBySemanticKey(assessments, options.semanticKey.trim());
    }

    const policies = await this.loadPolicySummaries(tripId, options?.userId);

    return {
      schemaId: 'tripnara.constraint_assessment_trace@v1',
      tripId,
      generatedAt,
      contextVersion,
      assessments,
      problems: problemTraceRows(problems, assessments).filter((p) =>
        options?.semanticKey?.trim()
          ? p.semanticKey === options.semanticKey.trim() ||
            p.assessmentIds.length > 0
          : true,
      ),
      policies,
      meta: {
        assessmentCount: assessments.length,
        problemCount: problems.length,
        filterSemanticKey: options?.semanticKey?.trim() || undefined,
      },
    };
  }

  private async buildPolicyRefsByIssueId(
    tripId: string,
    issues: import('../../../trips/trip-constraint-solver/types/trip-constraint-solver.types').FeasibilityIssueDto[],
    _userId?: string,
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    const conflictItems = issues.map((issue) => ({
      id: issue.id,
      source: 'feasibility' as const,
      priority: issue.priority,
      category: issue.category as import('../../../trips/trip-constraint-solver/types/planning-conflicts.types').PlanningConflictCategory,
      title: issue.title,
      message: issue.message,
      affectedDays: issue.affectedDays,
      semanticKey: issue.semanticKey,
      issue,
    }));
    const enriched = enrichPlanningConflictsWithRelatedConstraintIds(conflictItems);
    for (const c of enriched) {
      if (c.relatedConstraintIds?.length && c.issue) {
        map.set(c.issue.id, c.relatedConstraintIds);
      }
    }
    return map;
  }

  private async loadPolicySummaries(
    tripId: string,
    userId?: string,
  ): Promise<ConstraintAssessmentTraceBundle['policies']> {
    try {
      const uid = userId ?? 'trace-system';
      const list = await this.constraintRegistry.list(tripId, uid, {});
      return list.items
        .filter((c) => c.source?.type !== 'OFFICIAL_RULE' && c.source?.type !== 'WORLD_DATA')
        .slice(0, 50)
        .map((c) => ({
          policyId: c.id,
          name: c.name,
          category: c.category,
          hardness: c.type,
        }));
    } catch {
      return [];
    }
  }
}
