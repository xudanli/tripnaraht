/**
 * Collect DecisionProblems from feasibility issues + Gate/DSO violations.
 */

import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ConstraintReport } from '../../../decision/kernel/decision-state.types';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { TripConstraintRegistryService } from '../../trip-constraint-solver/services/trip-constraint-registry.service';
import {
  isPhase6OfficialTripConstraintProblemMergeDisabled,
} from '../../../decision-runtime/phase6-legacy-deprecation.config';
import { enrichPlanningConflictsWithRelatedConstraintIds } from '../../trip-constraint-solver/utils/constraint-conflict-link.util';
import { feasibilityIssueToPlanningItem } from '../../trip-constraint-solver/utils/planning-conflicts.util';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import { readFeasibilitySnapshot, resolveTripRevision, revisionToString } from '../../trip-constraint-solver/utils/trip-revision.util';
import type {
  ConstraintAssertion,
  DecisionProblem,
  DecisionProblemDetail,
} from '../types/decision-semantics.types';
import { adaptFeasibilityIssueToProblem } from '../normalizers/from-feasibility-issue.adapter';
import { filterIssuesForDecisionEscalation } from '../../trip-constraint-solver/utils/feasibility-resolution-mode.util';
import {
  adaptGateViolationToProblem,
  constraintViolationItemsToGateLike,
  gateProblemDuplicatesFeasibility,
  mergeSourceRefs,
  problemDedupeKey,
} from '../normalizers/from-gate-violation.adapter';
import {
  adaptTripConstraintToProblem,
  tripConstraintProblemDuplicatesExisting,
} from '../normalizers/from-trip-constraint.adapter';
import { DecisionRecordStoreService } from '../persistence/decision-record.store';
import { applyProblemResolutions } from '../read/apply-problem-resolution.util';
import { buildPlanningConflictsCacheKey } from '../../trip-constraint-solver/utils/planning-conflicts-cache-key.util';
import type { TripFeasibilityReportDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import { DecisionProblemCollectorCacheStore } from './decision-problem-collector-cache.store';
import { isDecisionProblemSsotStoreEnabled } from '../../../decision-runtime/decision-problems/decision-problem-ssot.config';
import { DecisionProblemSynthesizerService } from '../../../decision-runtime/decision-problems/synthesizers/decision-problem-synthesizer.service';
import { DecisionProblemSsotStoreService } from '../../../decision-runtime/decision-problems/persistence/decision-problem-ssot.store';
import { resolveEvaluationContextVersion } from '../../../decision-runtime/constraints/utils/evaluation-context-version.util';

const METADATA_DSO_KEY = 'dso';
const SEMANTICS_SYSTEM_USER = 'decision-semantics';

export interface CollectedDecisionProblems {
  tripVersion: string;
  detectedAt: string;
  feasibilityIssues: FeasibilityIssueDto[];
  items: DecisionProblemDetail[];
  issueByProblemId: Map<string, FeasibilityIssueDto>;
  /** Full feasibility report from the same collect pass — avoids duplicate getReport on options. */
  feasibilityReport: TripFeasibilityReportDto;
}

@Injectable()
export class DecisionProblemCollectorService {
  private readonly cache = new DecisionProblemCollectorCacheStore();

  constructor(
    private readonly prisma: PrismaService,
    private readonly feasibility: FeasibilityReportService,
    private readonly constraintRegistry: TripConstraintRegistryService,
    private readonly recordStore: DecisionRecordStoreService,
    @Optional() private readonly synthesizer?: DecisionProblemSynthesizerService,
    @Optional() private readonly ssotStore?: DecisionProblemSsotStoreService,
  ) {}

  invalidateCache(tripId: string): void {
    this.cache.clear(tripId);
  }

  async collect(tripId: string): Promise<CollectedDecisionProblems> {
    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    const revisionKey = tripRow
      ? buildPlanningConflictsCacheKey(tripRow)
      : `missing:${Date.now()}`;

    const cached = this.cache.get(tripId, revisionKey);
    if (cached) return cached;

    const inflight = this.cache.getInflight(tripId);
    if (inflight) return inflight;

    const promise = this.collectUncached(tripId, tripRow);
    this.cache.setInflight(tripId, promise);
    const payload = await promise;
    this.cache.put(tripId, revisionKey, payload);
    return payload;
  }

  private async collectUncached(
    tripId: string,
    trip: { metadata: unknown; updatedAt: Date } | null,
  ): Promise<CollectedDecisionProblems> {
    const report = await this.feasibility.getReport(tripId);

    const detectedAt = report.verifiedAt ?? new Date().toISOString();
    const tripVersion = report.currentTripVersion;
    const issueByProblemId = new Map<string, FeasibilityIssueDto>();
    const merged = new Map<string, DecisionProblemDetail>();

    if (isDecisionProblemSsotStoreEnabled() && this.synthesizer && this.ssotStore) {
      const contextVersion = resolveEvaluationContextVersion({
        tripId,
        metadata: trip?.metadata,
        updatedAt: trip?.updatedAt ?? new Date(0),
      });
      const { problems: baseProblems } = await this.ssotStore.loadAuthoritative(
        tripId,
        contextVersion,
        async () =>
          this.synthesizer!.synthesizeFromFeasibilityIssues(report.issues, {
            tripId,
            tripVersion,
            detectedAt,
            contextVersion,
            evaluatedAt: detectedAt,
          }),
      );
      for (const detail of baseProblems) {
        const linked = report.issues.find(
          (issue) =>
            issue.id === detail.sourceRefs[0]?.refId || issue.semanticKey === detail.semanticKey,
        );
        if (linked) {
          issueByProblemId.set(detail.id, linked);
          issueByProblemId.set(linked.id, linked);
          if (linked.semanticKey) issueByProblemId.set(linked.semanticKey, linked);
        }
        merged.set(problemDedupeKey(detail), detail);
      }
    } else {
      const escalatedIssues = filterIssuesForDecisionEscalation(report.issues);
      for (const issue of escalatedIssues) {
        const { problem, assertion } = adaptFeasibilityIssueToProblem(
          issue,
          tripId,
          tripVersion,
          detectedAt,
        );
        issueByProblemId.set(problem.id, issue);
        issueByProblemId.set(issue.id, issue);
        if (issue.semanticKey) issueByProblemId.set(issue.semanticKey, issue);

        merged.set(problemDedupeKey(problem), {
          ...problem,
          assertions: [assertion],
        });
      }
    }

    const gateViolations = this.readGateViolations(trip?.metadata);
    let gateIndex = 0;
    for (const gv of gateViolations) {
      if (gateProblemDuplicatesFeasibility(gv.detail, gv.constraint, report.issues)) {
        continue;
      }
      const { problem, assertion } = adaptGateViolationToProblem(
        gv,
        gateIndex++,
        tripId,
        tripVersion,
        detectedAt,
      );
      const key = problemDedupeKey(problem);
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, {
          ...existing,
          sourceRefs: mergeSourceRefs(existing.sourceRefs, problem.sourceRefs),
          assertionIds: [...new Set([...existing.assertionIds, ...assertion.id])],
          assertions: mergeAssertions(existing.assertions, assertion),
          detectedBy: existing.detectedBy === 'FEASIBILITY' ? 'FEASIBILITY' : problem.detectedBy,
        });
      } else {
        merged.set(key, { ...problem, assertions: [assertion] });
      }
    }

    const snapshot = readFeasibilitySnapshot(trip?.metadata);
    if (
      snapshot?.gateResult === 'BLOCK' &&
      merged.size === 0 &&
      report.issues.length === 0
    ) {
      const synthetic = adaptGateViolationToProblem(
        {
          type: 'HARNESS_GATE',
          severity: 'HARD',
          detail: 'Gate 评估为 BLOCK；请重新验证可行性或查看约束控制台。',
          constraint: 'gate_snapshot_block',
        },
        gateIndex,
        tripId,
        tripVersion,
        detectedAt,
      );
      merged.set(problemDedupeKey(synthetic.problem), {
        ...synthetic.problem,
        assertions: [synthetic.assertion],
      });
    }

    await this.mergeTripConstraintProblems(
      tripId,
      tripVersion,
      detectedAt,
      report.issues,
      merged,
    );

    const resolutions = await this.recordStore.listProblemResolutions(tripId);
    const { items, staleSemanticKeys } = applyProblemResolutions([...merged.values()], resolutions);
    if (staleSemanticKeys.length) {
      await this.recordStore.removeProblemResolutionsBySemanticKeys(tripId, staleSemanticKeys);
    }

    return {
      tripVersion,
      detectedAt,
      feasibilityIssues: report.issues,
      items,
      issueByProblemId,
      feasibilityReport: report,
    };
  }

  async resolveTripVersion(tripId: string): Promise<string> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { updatedAt: true, metadata: true },
    });
    if (!trip) return '0';
    return revisionToString(resolveTripRevision(trip));
  }

  private readGateViolations(metadata: unknown): ReturnType<typeof constraintViolationItemsToGateLike> {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const dso = meta[METADATA_DSO_KEY] as Record<string, unknown> | undefined;
    const cr = dso?.constraints as ConstraintReport | undefined;
    if (cr?.violations?.length) {
      return constraintViolationItemsToGateLike(cr.violations);
    }
    return [];
  }

  private async mergeTripConstraintProblems(
    tripId: string,
    tripVersion: string,
    detectedAt: string,
    feasibilityIssues: FeasibilityIssueDto[],
    merged: Map<string, DecisionProblemDetail>,
  ): Promise<void> {
    try {
      const { items } = await this.constraintRegistry.list(tripId, SEMANTICS_SYSTEM_USER, {});
      const conflicted = items.filter((c) => c.hasConflict);
      if (!conflicted.length) return;

      const planningItems = enrichPlanningConflictsWithRelatedConstraintIds(
        feasibilityIssues.map(feasibilityIssueToPlanningItem),
      );

      for (const constraint of conflicted) {
        if (
          isPhase6OfficialTripConstraintProblemMergeDisabled() &&
          constraint.source.type === 'OFFICIAL_RULE'
        ) {
          continue;
        }
        const linked = planningItems.filter((c) => c.relatedConstraintIds?.includes(constraint.id));
        const { problem, assertion } = adaptTripConstraintToProblem(
          constraint,
          tripId,
          tripVersion,
          detectedAt,
          linked[0],
        );

        if (
          tripConstraintProblemDuplicatesExisting(
            { ...problem, description: problem.description },
            merged,
            feasibilityIssues,
          )
        ) {
          continue;
        }

        const key = problemDedupeKey(problem);
        const existing = merged.get(key);
        if (existing) {
          merged.set(key, {
            ...existing,
            sourceRefs: mergeSourceRefs(existing.sourceRefs, problem.sourceRefs),
            assertionIds: [...new Set([...existing.assertionIds, assertion.id])],
            assertions: mergeAssertions(existing.assertions, assertion),
          });
        } else {
          merged.set(key, { ...problem, assertions: [assertion] });
        }
      }
    } catch {
      // TripConstraint synthesis is best-effort; feasibility/gate remain primary.
    }
  }
}

function mergeAssertions(
  existing: ConstraintAssertion[],
  incoming: ConstraintAssertion,
): ConstraintAssertion[] {
  if (existing.some((a) => a.id === incoming.id)) return existing;
  return [...existing, incoming];
}
