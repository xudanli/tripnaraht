/**
 * Shadow Review Queue — materialize blind cases from OptimizationShadowEvent.
 * Task E0: durable persistence when SHADOW_EVIDENCE_PERSISTENCE_ENABLED=1.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ShadowObservabilityService } from './shadow-observability.service';
import { ShadowEvidenceStore } from './shadow-evidence.store';
import { assignBlindOptions } from './shadow-review-blinding.util';
import { assessShadowReviewEligibility } from './shadow-review-eligibility.util';
import {
  deriveReviewClassification,
  type ReviewPreferredOption,
} from './shadow-review-classification.util';
import {
  buildFrozenReviewPlanSnapshot,
  candidatesHaveEquivalentPlans,
} from './shadow-review-plan-snapshot.util';
import { isShadowEvidencePersistenceEnabled } from './shadow-evidence-persistence.config';
import { DEFAULT_EXPECTED_REVIEW_COUNT } from './shadow-evidence-persistence.config';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type {
  ManualReviewVerdict,
  OptimizationShadowEvent,
} from './shadow-divergence.types';
import type {
  ReviewAssignment,
  ShadowReviewCase,
  ShadowReviewCaseBlindView,
  ShadowReviewCaseStatus,
  ShadowReviewMaterializeResult,
  ShadowReviewStatsSnapshot,
} from './shadow-review.types';

const MAX_CASES = 500;

export interface MaterializeShadowReviewsInput {
  comparisonIds?: string[];
  tripId?: string;
  limit?: number;
  force?: boolean;
}

export interface SubmitShadowReviewInput {
  preferredOption: ReviewPreferredOption;
  scores: {
    reasonableness: number;
    executability: number;
    requirementFit: number;
    paceFit: number;
  };
  tradeOffSummary: string;
  confidence: number;
  reviewerId: string;
  idempotencyKey?: string;
  reviewDurationMs?: number;
}

@Injectable()
export class ShadowReviewService {
  private readonly logger = new Logger(ShadowReviewService.name);
  private readonly cases = new Map<string, ShadowReviewCase>();
  private readonly byComparisonId = new Map<string, string>();

  constructor(
    @Optional() private readonly shadowObservability?: ShadowObservabilityService,
    @Optional() private readonly evidenceStore?: ShadowEvidenceStore,
  ) {}

  async materialize(
    input: MaterializeShadowReviewsInput = {},
  ): Promise<ShadowReviewMaterializeResult> {
    if (this.usePersistence()) {
      return this.materializePersistent(input);
    }
    return this.materializeInMemory(input);
  }

  async getQueue(input?: {
    status?: ShadowReviewCaseStatus;
    tripId?: string;
    limit?: number;
  }): Promise<ShadowReviewCaseBlindView[]> {
    if (this.usePersistence()) {
      const cases = await this.evidenceStore!.listReviewCases(input ?? {});
      return cases.map((c) => this.toBlindView(c));
    }
    return this.getQueueInMemory(input);
  }

  async getCase(reviewCaseId: string): Promise<ShadowReviewCaseBlindView | undefined> {
    if (this.usePersistence()) {
      const c = await this.evidenceStore!.getReviewCase(reviewCaseId);
      return c ? this.toBlindView(c) : undefined;
    }
    const c = this.cases.get(reviewCaseId);
    return c ? this.toBlindView(c) : undefined;
  }

  async submitReview(
    reviewCaseId: string,
    input: SubmitShadowReviewInput,
  ): Promise<ShadowReviewCaseBlindView> {
    if (this.usePersistence()) {
      const { reviewCase } = await this.evidenceStore!.submitReview({
        reviewCaseId,
        reviewerId: input.reviewerId,
        preferredOption: input.preferredOption,
        scores: {
          reasonableness: clampScore(input.scores.reasonableness),
          executability: clampScore(input.scores.executability),
          requirementFit: clampScore(input.scores.requirementFit),
          paceFit: clampScore(input.scores.paceFit),
        },
        tradeOffSummary: input.tradeOffSummary.trim(),
        confidence: clampScore(input.confidence),
        idempotencyKey: input.idempotencyKey,
        reviewDurationMs: input.reviewDurationMs,
      });
      return this.toBlindView(reviewCase);
    }
    return this.submitReviewInMemory(reviewCaseId, input);
  }

  async getStats(): Promise<ShadowReviewStatsSnapshot> {
    if (this.usePersistence()) {
      return this.evidenceStore!.getStats();
    }
    return this.getStatsInMemory();
  }

  private usePersistence(): boolean {
    return isShadowEvidencePersistenceEnabled() && this.evidenceStore?.enabled() === true;
  }

  private async materializePersistent(
    input: MaterializeShadowReviewsInput,
  ): Promise<ShadowReviewMaterializeResult> {
    const comparisonIds = await this.resolveComparisonIds(input);
    let scanned = 0;
    let created = 0;
    let alreadyExists = 0;
    let excluded = 0;
    let failed = 0;
    const materialized: ShadowReviewCaseBlindView[] = [];
    const skipped: Array<{ comparisonId: string; reason: string }> = [];

    for (const comparisonId of comparisonIds) {
      scanned += 1;
      const event =
        (await this.evidenceStore!.getEvent(comparisonId)) ??
        this.shadowObservability?.getEvent(comparisonId);
      if (!event) {
        failed += 1;
        skipped.push({ comparisonId, reason: 'EVENT_NOT_FOUND' });
        continue;
      }

      const artifacts = await this.resolveReviewArtifacts(comparisonId, event);
      if (!artifacts) {
        failed += 1;
        skipped.push({ comparisonId, reason: 'REVIEW_ARTIFACT_MISSING' });
        continue;
      }

      const result = await this.evidenceStore!.materializeReviewCase(event, artifacts);
      if (result.kind === 'created') {
        created += 1;
        materialized.push(this.toBlindView(result.reviewCase));
      } else if (result.kind === 'exists') {
        alreadyExists += 1;
        skipped.push({ comparisonId, reason: 'ALREADY_MATERIALIZED' });
        if (input.force) {
          materialized.push(this.toBlindView(result.reviewCase));
        }
      } else if (result.kind === 'excluded') {
        excluded += 1;
        skipped.push({ comparisonId, reason: result.reason });
      } else {
        failed += 1;
        skipped.push({ comparisonId, reason: result.reason });
      }
    }

    this.logger.log(
      `materialize scanned=${scanned} created=${created} exists=${alreadyExists} excluded=${excluded}`,
    );
    return { scanned, created, alreadyExists, excluded, failed, materialized, skipped };
  }

  private materializeInMemory(
    input: MaterializeShadowReviewsInput,
  ): ShadowReviewMaterializeResult {
    const events = this.resolveEvents(input);
    let scanned = 0;
    let created = 0;
    let alreadyExists = 0;
    let excluded = 0;
    let failed = 0;
    const materialized: ShadowReviewCaseBlindView[] = [];
    const skipped: Array<{ comparisonId: string; reason: string }> = [];

    for (const event of events) {
      scanned += 1;
      const existing = this.byComparisonId.get(event.comparisonId);
      if (existing && !input.force) {
        alreadyExists += 1;
        skipped.push({ comparisonId: event.comparisonId, reason: 'ALREADY_MATERIALIZED' });
        continue;
      }

      const built = this.buildCaseFromEvent(event);
      if ('reason' in built) {
        if (assessShadowReviewEligibility(event).eligible === false) {
          excluded += 1;
        } else {
          failed += 1;
        }
        skipped.push({ comparisonId: event.comparisonId, reason: built.reason });
        continue;
      }

      this.cases.set(built.reviewCaseId, built);
      this.byComparisonId.set(event.comparisonId, built.reviewCaseId);
      this.trimCases();
      created += 1;
      materialized.push(this.toBlindView(built));
    }

    return { scanned, created, alreadyExists, excluded, failed, materialized, skipped };
  }

  private async resolveComparisonIds(
    input: MaterializeShadowReviewsInput,
  ): Promise<string[]> {
    if (input.comparisonIds?.length) return input.comparisonIds;
    const fromDb = await this.evidenceStore!.listComparisonIds({
      tripId: input.tripId,
      limit: input.limit,
    });
    if (fromDb.length) return fromDb;
    return this.resolveEvents(input).map((e) => e.comparisonId);
  }

  private getQueueInMemory(input?: {
    status?: ShadowReviewCaseStatus;
    tripId?: string;
    limit?: number;
  }): ShadowReviewCaseBlindView[] {
    const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
    let items = [...this.cases.values()].sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    );
    if (input?.status) items = items.filter((c) => c.status === input.status);
    if (input?.tripId) items = items.filter((c) => c.tripId === input.tripId);
    return items.slice(0, limit).map((c) => this.toBlindView(c));
  }

  private submitReviewInMemory(
    reviewCaseId: string,
    input: SubmitShadowReviewInput,
  ): ShadowReviewCaseBlindView {
    const reviewCase = this.cases.get(reviewCaseId);
    if (!reviewCase) throw new Error(`Review case not found: ${reviewCaseId}`);
    if (reviewCase.status === 'EXCLUDED') {
      throw new Error(`Review case excluded: ${reviewCase.exclusionReason}`);
    }

    const dup = reviewCase.reviewAssignments.find(
      (a) => a.reviewerId === input.reviewerId,
    );
    if (dup) return this.toBlindView(reviewCase);

    const classification = deriveReviewClassification({
      preferredOption: input.preferredOption,
      blindMapping: reviewCase.blindMapping,
    });

    const assignment: ReviewAssignment = {
      reviewerId: input.reviewerId,
      preferredOption: input.preferredOption,
      classification,
      scores: {
        reasonableness: clampScore(input.scores.reasonableness),
        executability: clampScore(input.scores.executability),
        requirementFit: clampScore(input.scores.requirementFit),
        paceFit: clampScore(input.scores.paceFit),
      },
      tradeOffSummary: input.tradeOffSummary.trim(),
      confidence: clampScore(input.confidence),
      submittedAt: new Date().toISOString(),
    };

    reviewCase.reviewAssignments.push(assignment);
    reviewCase.completedReviewCount = (reviewCase.completedReviewCount ?? 0) + 1;
    reviewCase.status =
      reviewCase.completedReviewCount >= (reviewCase.expectedReviewCount ?? 1)
        ? 'COMPLETED'
        : 'IN_REVIEW';
    reviewCase.updatedAt = assignment.submittedAt;
    return this.toBlindView(reviewCase);
  }

  private getStatsInMemory(): ShadowReviewStatsSnapshot {
    const byStatus = emptyStatusCounts();
    const byClassification = emptyClassificationCounts();
    const byDivergenceType: Record<string, number> = {};
    const bySeverity = emptySeverityCounts();
    let completedReviews = 0;

    for (const c of this.cases.values()) {
      byStatus[c.status] += 1;
      bySeverity[c.divergenceSeverity] += 1;
      for (const t of c.divergenceTypes) {
        byDivergenceType[t] = (byDivergenceType[t] ?? 0) + 1;
      }
      for (const a of c.reviewAssignments) {
        if (a.classification) byClassification[a.classification] += 1;
        completedReviews += 1;
      }
    }

    return {
      schemaId: 'tripnara.shadow_review_stats@v1',
      collectedAt: new Date().toISOString(),
      totalCases: this.cases.size,
      byStatus,
      byClassification,
      byDivergenceType,
      bySeverity,
      completedReviews,
    };
  }

  private resolveEvents(input: MaterializeShadowReviewsInput): OptimizationShadowEvent[] {
    if (!this.shadowObservability) return [];
    if (input.comparisonIds?.length) {
      return input.comparisonIds
        .map((id) => this.shadowObservability!.getEvent(id))
        .filter((e): e is OptimizationShadowEvent => e != null);
    }
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    if (input.tripId) {
      return this.shadowObservability.getRecentEventsFiltered({
        tripId: input.tripId,
        limit,
      });
    }
    return this.shadowObservability.getRecentEvents(limit);
  }

  private buildCaseFromEvent(
    event: OptimizationShadowEvent,
  ): ShadowReviewCase | { reason: string } {
    const eligibility = assessShadowReviewEligibility(event);
    if (!eligibility.eligible) {
      return { reason: eligibility.exclusionReason ?? 'NOT_ELIGIBLE' };
    }

    const artifact = this.shadowObservability?.getReviewArtifact(event.comparisonId);
    if (!artifact) return { reason: 'REVIEW_ARTIFACT_MISSING' };

    const authorityId = event.authorityResult.selectedCandidateId!;
    const shadowId = event.shadowResult!.selectedCandidateId!;
    const authorityCandidate = artifact.candidatesById[authorityId];
    const shadowCandidate = artifact.candidatesById[shadowId];
    if (!authorityCandidate || !shadowCandidate) {
      return { reason: 'CANDIDATE_PLAN_MISSING' };
    }

    const authorityFrozen = buildFrozenReviewPlanSnapshot({
      candidate: authorityCandidate,
      constraintReport: artifact.constraintReportsByCandidateId[authorityId],
      snapshotId: event.snapshotId,
      strategyVersionHidden: event.authorityResult.strategyVersion,
    });
    const shadowFrozen = buildFrozenReviewPlanSnapshot({
      candidate: shadowCandidate,
      constraintReport: artifact.constraintReportsByCandidateId[shadowId],
      snapshotId: event.snapshotId,
      strategyVersionHidden: event.shadowResult?.strategyVersion,
    });

    if (candidatesHaveEquivalentPlans(authorityFrozen, shadowFrozen)) {
      return { reason: 'IDENTICAL_PLAN_CONTENT' };
    }

    const blind = assignBlindOptions({
      comparisonId: event.comparisonId,
      authoritySnapshot: authorityFrozen,
      shadowSnapshot: shadowFrozen,
    });

    const reviewCaseId = `rev_${randomUUID()}`;
    const now = new Date().toISOString();
    return {
      schemaId: 'tripnara.shadow_review_case@v1',
      reviewCaseId,
      comparisonId: event.comparisonId,
      decisionRunId: event.decisionRunId,
      tripId: event.tripId,
      status: 'PENDING',
      authorityCandidateId: authorityId,
      shadowCandidateId: shadowId,
      divergenceTypes: event.divergence.types,
      divergenceSeverity: event.divergence.severity,
      eligibleForReview: true,
      blindedOptionA: blind.blindedOptionA,
      blindedOptionB: blind.blindedOptionB,
      blindMapping: blind.blindMapping,
      frozenSnapshots: { authority: authorityFrozen, shadow: shadowFrozen },
      blindingVersion: blind.blindingVersion,
      expectedReviewCount: DEFAULT_EXPECTED_REVIEW_COUNT,
      completedReviewCount: 0,
      reviewAssignments: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  private toBlindView(reviewCase: ShadowReviewCase): ShadowReviewCaseBlindView {
    return {
      reviewCaseId: reviewCase.reviewCaseId,
      comparisonId: reviewCase.comparisonId,
      tripId: reviewCase.tripId,
      status: reviewCase.status,
      divergenceTypes: reviewCase.divergenceTypes,
      divergenceSeverity: reviewCase.divergenceSeverity,
      blindedOptionA: reviewCase.blindedOptionA,
      blindedOptionB: reviewCase.blindedOptionB,
      reviewAssignments: reviewCase.reviewAssignments.map((a) => ({
        reviewerId: a.reviewerId,
        preferredOption: a.preferredOption,
        scores: a.scores,
        tradeOffSummary: a.tradeOffSummary,
        confidence: a.confidence,
        submittedAt: a.submittedAt,
      })),
      createdAt: reviewCase.createdAt,
    };
  }

  private async resolveReviewArtifacts(
    comparisonId: string,
    event: OptimizationShadowEvent,
  ) {
    const fromDb = await this.evidenceStore!.getArtifacts(comparisonId);
    const fromMem = this.shadowObservability?.getReviewArtifact(comparisonId);
    const authorityId = event.authorityResult.selectedCandidateId;
    const shadowId = event.shadowResult?.selectedCandidateId;

    const isComplete = (art?: { candidatesById: Record<string, DecisionCandidate> }) => {
      if (!art || !authorityId || !shadowId) return false;
      const a = art.candidatesById[authorityId];
      const s = art.candidatesById[shadowId];
      return Boolean(a?.plan?.days?.length && s?.plan?.days?.length);
    };

    if (isComplete(fromMem)) return fromMem;
    if (isComplete(fromDb)) return fromDb;
    return fromMem ?? fromDb;
  }

  private trimCases(): void {
    if (this.cases.size <= MAX_CASES) return;
    const sorted = [...this.cases.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    while (this.cases.size > MAX_CASES) {
      const oldest = sorted.shift();
      if (!oldest) break;
      this.cases.delete(oldest.reviewCaseId);
      this.byComparisonId.delete(oldest.comparisonId);
    }
  }
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function emptyStatusCounts(): Record<ShadowReviewCaseStatus, number> {
  return { PENDING: 0, IN_REVIEW: 0, COMPLETED: 0, EXCLUDED: 0 };
}

function emptyClassificationCounts(): Record<ManualReviewVerdict, number> {
  return {
    LEX_BETTER: 0,
    LEGACY_BETTER: 0,
    EQUIVALENT: 0,
    BOTH_INVALID: 0,
    INSUFFICIENT_INFORMATION: 0,
  };
}

function emptySeverityCounts(): Record<
  OptimizationShadowEvent['divergence']['severity'],
  number
> {
  return { NONE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}
