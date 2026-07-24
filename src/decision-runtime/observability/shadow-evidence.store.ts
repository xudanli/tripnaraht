/**
 * Task E0 — Durable shadow comparison + review evidence (PostgreSQL via Prisma).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { OptimizationShadowEvent } from './shadow-divergence.types';
import type { ShadowReviewArtifact } from './optimization-shadow-metrics.collector';
import {
  DEFAULT_EXPECTED_REVIEW_COUNT,
  SHADOW_BLINDING_VERSION,
  SHADOW_ELIGIBILITY_VERSION,
  SHADOW_REVIEW_FORM_VERSION,
  isShadowEvidencePersistenceEnabled,
} from './shadow-evidence-persistence.config';
import {
  encryptBlindMapping,
  decryptBlindMapping,
  ShadowBlindMappingDecryptError,
  type BlindMappingPayload,
} from './shadow-blind-mapping-crypto.util';
import { assignBlindOptions } from './shadow-review-blinding.util';
import {
  buildFrozenReviewPlanSnapshot,
  candidatesHaveEquivalentPlans,
} from './shadow-review-plan-snapshot.util';
import { assessShadowReviewEligibility } from './shadow-review-eligibility.util';
import {
  deriveReviewClassification,
  type ReviewPreferredOption,
} from './shadow-review-classification.util';
import type {
  FrozenReviewPlanSnapshot,
  ReviewAssignment,
  ReviewPlanSnapshot,
  ShadowReviewCase,
  ShadowReviewCaseBlindView,
  ShadowReviewCaseStatus,
  ShadowReviewStatsSnapshot,
} from './shadow-review.types';
import type { ManualReviewVerdict, DivergenceSeverity } from './shadow-divergence.types';

export interface AppendComparisonMeta {
  experimentId?: string;
  scenarioId?: string;
  benchmarkRunId?: string;
}

@Injectable()
export class ShadowEvidenceStore {
  private readonly logger = new Logger(ShadowEvidenceStore.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  enabled(): boolean {
    return isShadowEvidencePersistenceEnabled() && this.prisma != null;
  }

  async appendComparison(
    event: OptimizationShadowEvent,
    artifacts?: Omit<ShadowReviewArtifact, 'comparisonId' | 'recordedAt'>,
    meta?: AppendComparisonMeta,
  ): Promise<boolean> {
    if (!this.enabled() || !this.prisma) return false;

    try {
      await this.prisma.decisionShadowComparison.create({
        data: {
          comparisonId: event.comparisonId,
          decisionRunId: event.decisionRunId,
          tripId: event.tripId,
          snapshotId: event.snapshotId,
          snapshotHash: event.inputFingerprint.snapshotHash,
          candidateSetHash: event.inputFingerprint.candidateSetHash,
          constraintReportHash: event.inputFingerprint.constraintReportHash,
          objectiveConfigHash: event.inputFingerprint.objectiveConfigHash,
          authorityStrategyId: event.authorityStrategyId,
          authorityStrategyVersion: event.authorityResult.strategyVersion,
          shadowStrategyId: event.shadowStrategyId,
          shadowStrategyVersion: event.shadowResult?.strategyVersion,
          authorityWinnerId: event.authorityResult.selectedCandidateId,
          shadowWinnerId: event.shadowResult?.selectedCandidateId,
          eligibleForStrategyComparison: event.eligibleForStrategyComparison,
          divergenceTypes: event.divergence.types,
          divergenceSeverity: event.divergence.severity,
          eventJson: event as unknown as Prisma.InputJsonValue,
          authorityResultJson: event.authorityResult as unknown as Prisma.InputJsonValue,
          shadowResultJson: event.shadowResult
            ? (event.shadowResult as unknown as Prisma.InputJsonValue)
            : undefined,
          stageTracesJson: event.lexicographicStageTraces
            ? (event.lexicographicStageTraces as unknown as Prisma.InputJsonValue)
            : undefined,
          reviewArtifactsJson: artifacts
            ? ({
                candidatesById: artifacts.candidatesById,
                constraintReportsByCandidateId: artifacts.constraintReportsByCandidateId,
              } as unknown as Prisma.InputJsonValue)
            : undefined,
          experimentId: meta?.experimentId,
          scenarioId: meta?.scenarioId,
          benchmarkRunId: meta?.benchmarkRunId,
        },
      });
      return true;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        this.logger.debug(`comparison already persisted: ${event.comparisonId}`);
        return false;
      }
      this.logger.error(`appendComparison failed: ${event.comparisonId}`, err);
      throw err;
    }
  }

  async getEvent(comparisonId: string): Promise<OptimizationShadowEvent | undefined> {
    if (!this.enabled() || !this.prisma) return undefined;
    const row = await this.prisma.decisionShadowComparison.findUnique({
      where: { comparisonId },
    });
    return row ? (row.eventJson as unknown as OptimizationShadowEvent) : undefined;
  }

  async getArtifacts(comparisonId: string): Promise<ShadowReviewArtifact | undefined> {
    if (!this.enabled() || !this.prisma) return undefined;
    const row = await this.prisma.decisionShadowComparison.findUnique({
      where: { comparisonId },
    });
    if (!row?.reviewArtifactsJson) return undefined;
    const raw = row.reviewArtifactsJson as unknown as {
      candidatesById: Record<string, DecisionCandidate>;
      constraintReportsByCandidateId: Record<string, CanonicalConstraintReport>;
    };
    return {
      comparisonId,
      tripId: row.tripId,
      candidatesById: raw.candidatesById,
      constraintReportsByCandidateId: raw.constraintReportsByCandidateId,
      recordedAt: row.createdAt.toISOString(),
    };
  }

  async listComparisonIds(input: {
    tripId?: string;
    limit?: number;
    comparisonIds?: string[];
  }): Promise<string[]> {
    if (!this.enabled() || !this.prisma) return [];
    if (input.comparisonIds?.length) return input.comparisonIds;

    const rows = await this.prisma.decisionShadowComparison.findMany({
      where: input.tripId ? { tripId: input.tripId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(input.limit ?? 50, 1), 200),
      select: { comparisonId: true },
    });
    return rows.map((r) => r.comparisonId);
  }

  async getReviewCaseByComparisonId(
    comparisonId: string,
  ): Promise<ShadowReviewCase | undefined> {
    if (!this.enabled() || !this.prisma) return undefined;
    const row = await this.prisma.decisionShadowReviewCase.findUnique({
      where: { comparisonId },
      include: { submissions: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? mapCaseRow(row) : undefined;
  }

  async getReviewCase(reviewCaseId: string): Promise<ShadowReviewCase | undefined> {
    if (!this.enabled() || !this.prisma) return undefined;
    const row = await this.prisma.decisionShadowReviewCase.findUnique({
      where: { reviewCaseId },
      include: { submissions: { orderBy: { createdAt: 'asc' } } },
    });
    return row ? mapCaseRow(row) : undefined;
  }

  async listReviewCases(input: {
    status?: ShadowReviewCaseStatus;
    tripId?: string;
    limit?: number;
    excludeExcluded?: boolean;
  }): Promise<ShadowReviewCase[]> {
    if (!this.enabled() || !this.prisma) return [];
    const statusFilter = input.status
      ? { status: input.status }
      : input.excludeExcluded !== false
        ? { status: { in: ['PENDING', 'IN_REVIEW', 'COMPLETED'] } }
        : {};
    const rows = await this.prisma.decisionShadowReviewCase.findMany({
      where: {
        ...statusFilter,
        ...(input.tripId ? { tripId: input.tripId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(input.limit ?? 50, 1), 200),
      include: { submissions: { orderBy: { createdAt: 'asc' } } },
    });
    return rows.map(mapCaseRow);
  }

  async materializeReviewCase(
    event: OptimizationShadowEvent,
    artifacts: ShadowReviewArtifact,
  ): Promise<
    | { kind: 'created'; reviewCase: ShadowReviewCase }
    | { kind: 'exists'; reviewCase: ShadowReviewCase }
    | { kind: 'excluded'; reason: string }
    | { kind: 'failed'; reason: string }
  > {
    if (!this.enabled() || !this.prisma) {
      return { kind: 'failed', reason: 'PERSISTENCE_DISABLED' };
    }

    const existing = await this.getReviewCaseByComparisonId(event.comparisonId);
    if (existing) {
      return { kind: 'exists', reviewCase: existing };
    }

    const eligibility = assessShadowReviewEligibility(event);
    if (!eligibility.eligible) {
      const excluded = await this.persistExcludedReviewCase(
        event,
        eligibility.exclusionReason ?? 'NOT_ELIGIBLE',
      );
      if (excluded.kind === 'exists') {
        return { kind: 'exists', reviewCase: excluded.reviewCase };
      }
      return { kind: 'excluded', reason: excluded.reason };
    }

    const authorityId = event.authorityResult.selectedCandidateId!;
    const shadowId = event.shadowResult!.selectedCandidateId!;
    const authorityCandidate = artifacts.candidatesById[authorityId];
    const shadowCandidate = artifacts.candidatesById[shadowId];
    if (!authorityCandidate || !shadowCandidate) {
      const excluded = await this.persistExcludedReviewCase(
        event,
        'MISSING_REVIEW_ARTIFACTS',
      );
      if (excluded.kind === 'exists') {
        return { kind: 'exists', reviewCase: excluded.reviewCase };
      }
      return { kind: 'failed', reason: 'CANDIDATE_PLAN_MISSING' };
    }

    const authorityFrozen = buildFrozenReviewPlanSnapshot({
      candidate: authorityCandidate,
      constraintReport: artifacts.constraintReportsByCandidateId[authorityId],
      snapshotId: event.snapshotId,
      strategyVersionHidden: event.authorityResult.strategyVersion,
    });
    const shadowFrozen = buildFrozenReviewPlanSnapshot({
      candidate: shadowCandidate,
      constraintReport: artifacts.constraintReportsByCandidateId[shadowId],
      snapshotId: event.snapshotId,
      strategyVersionHidden: event.shadowResult?.strategyVersion,
    });

    if (candidatesHaveEquivalentPlans(authorityFrozen, shadowFrozen)) {
      const excluded = await this.persistExcludedReviewCase(
        event,
        'IDENTICAL_PLAN_CONTENT',
      );
      if (excluded.kind === 'exists') {
        return { kind: 'exists', reviewCase: excluded.reviewCase };
      }
      return { kind: 'excluded', reason: excluded.reason };
    }

    const blind = assignBlindOptions({
      comparisonId: event.comparisonId,
      authoritySnapshot: authorityFrozen,
      shadowSnapshot: shadowFrozen,
    });

    const reviewCaseId = `rev_${randomUUID()}`;
    const blindEncrypted = encryptBlindMapping(blind.blindMapping);
    const now = new Date();

    try {
      await this.prisma.decisionShadowReviewCase.create({
        data: {
          reviewCaseId,
          comparisonId: event.comparisonId,
          tripId: event.tripId,
          decisionRunId: event.decisionRunId,
          status: 'PENDING',
          blindedOptionAJson: blind.blindedOptionA as unknown as Prisma.InputJsonValue,
          blindedOptionBJson: blind.blindedOptionB as unknown as Prisma.InputJsonValue,
          frozenSnapshotsJson: {
            authority: authorityFrozen,
            shadow: shadowFrozen,
          } as unknown as Prisma.InputJsonValue,
          blindingVersion: blind.blindingVersion,
          blindMappingEncrypted: blindEncrypted,
          divergenceTypes: event.divergence.types,
          divergenceSeverity: event.divergence.severity,
          eligibilityVersion: SHADOW_ELIGIBILITY_VERSION,
          expectedReviewCount: DEFAULT_EXPECTED_REVIEW_COUNT,
          completedReviewCount: 0,
        },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        const prior = await this.getReviewCaseByComparisonId(event.comparisonId);
        if (prior) return { kind: 'exists', reviewCase: prior };
      }
      throw err;
    }

    const reviewCase: ShadowReviewCase = {
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
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return { kind: 'created', reviewCase };
  }

  async submitReview(input: {
    reviewCaseId: string;
    reviewerId: string;
    preferredOption: ReviewPreferredOption;
    scores: ReviewAssignment['scores'];
    tradeOffSummary: string;
    confidence: number;
    idempotencyKey?: string;
    reviewDurationMs?: number;
  }): Promise<{ assignment: ReviewAssignment; reviewCase: ShadowReviewCase }> {
    if (!this.enabled() || !this.prisma) {
      throw new Error('Shadow evidence persistence disabled');
    }

    if (input.idempotencyKey) {
      const prior = await this.prisma.decisionShadowReviewSubmission.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: {
          reviewCase: { include: { submissions: { orderBy: { createdAt: 'asc' } } } },
        },
      });
      if (prior) {
        return {
          assignment: mapSubmissionRow(prior),
          reviewCase: mapCaseRow(prior.reviewCase),
        };
      }
    }

    const row = await this.prisma.decisionShadowReviewCase.findUnique({
      where: { reviewCaseId: input.reviewCaseId },
      include: { submissions: true },
    });
    if (!row) throw new Error(`Review case not found: ${input.reviewCaseId}`);
    if (row.status === 'EXCLUDED') {
      throw new Error(`Review case excluded: ${row.exclusionReason ?? 'EXCLUDED'}`);
    }

    const dupReviewer = row.submissions.find((s) => s.reviewerId === input.reviewerId);
    if (dupReviewer) {
      const full = await this.getReviewCase(input.reviewCaseId);
      if (!full) throw new Error('Review case not found after duplicate check');
      return {
        assignment: mapSubmissionRow(dupReviewer),
        reviewCase: full,
      };
    }

    const mapping = decryptBlindMapping(row.blindMappingEncrypted);
    const classification = deriveReviewClassification({
      preferredOption: input.preferredOption,
      blindMapping: mapping,
    });

    const submissionId = `sub_${randomUUID()}`;
    const submittedAt = new Date();
    const assignment: ReviewAssignment = {
      reviewerId: input.reviewerId,
      preferredOption: input.preferredOption,
      classification,
      scores: input.scores,
      tradeOffSummary: input.tradeOffSummary,
      confidence: input.confidence,
      submittedAt: submittedAt.toISOString(),
    };

    const completedCount = row.completedReviewCount + 1;
    const newStatus: ShadowReviewCaseStatus =
      completedCount >= row.expectedReviewCount
        ? 'COMPLETED'
        : completedCount > 0
          ? 'IN_REVIEW'
          : 'PENDING';

    await this.prisma.$transaction([
      this.prisma.decisionShadowReviewSubmission.create({
        data: {
          submissionId,
          reviewCaseId: input.reviewCaseId,
          reviewerId: input.reviewerId,
          preferredOption: input.preferredOption,
          classification,
          scoresJson: input.scores as unknown as Prisma.InputJsonValue,
          tradeOffSummary: input.tradeOffSummary,
          confidence: input.confidence,
          reviewDurationMs: input.reviewDurationMs,
          reviewFormVersion: SHADOW_REVIEW_FORM_VERSION,
          idempotencyKey: input.idempotencyKey,
        },
      }),
      this.prisma.decisionShadowReviewCase.update({
        where: { reviewCaseId: input.reviewCaseId },
        data: {
          completedReviewCount: completedCount,
          status: newStatus,
          completedAt: newStatus === 'COMPLETED' ? submittedAt : row.completedAt,
        },
      }),
    ]);

    const updated = await this.getReviewCase(input.reviewCaseId);
    if (!updated) throw new Error('Review case missing after submit');
    return { assignment, reviewCase: updated };
  }

  async getStats(): Promise<ShadowReviewStatsSnapshot> {
    if (!this.enabled() || !this.prisma) {
      return emptyStats();
    }

    const cases = await this.prisma.decisionShadowReviewCase.findMany({
      include: { submissions: true },
    });

    const byStatus = emptyStatusCounts();
    const byClassification = emptyClassificationCounts();
    const byDivergenceType: Record<string, number> = {};
    const bySeverity = emptySeverityCounts();
    let completedReviews = 0;

    for (const c of cases) {
      let mapped: ShadowReviewCase;
      try {
        mapped = mapCaseRow(c);
      } catch (err: unknown) {
        if (err instanceof ShadowBlindMappingDecryptError) throw err;
        throw err;
      }
      byStatus[mapped.status] += 1;
      bySeverity[mapped.divergenceSeverity as DivergenceSeverity] += 1;
      for (const t of mapped.divergenceTypes) {
        byDivergenceType[t] = (byDivergenceType[t] ?? 0) + 1;
      }
      for (const a of mapped.reviewAssignments) {
        if (a.classification) byClassification[a.classification] += 1;
        completedReviews += 1;
      }
    }

    return {
      schemaId: 'tripnara.shadow_review_stats@v1',
      collectedAt: new Date().toISOString(),
      totalCases: cases.length,
      byStatus,
      byClassification,
      byDivergenceType,
      bySeverity: bySeverity as ShadowReviewStatsSnapshot['bySeverity'],
      completedReviews,
    };
  }

  decryptMapping(encrypted: string): BlindMappingPayload {
    return decryptBlindMapping(encrypted);
  }

  private async persistExcludedReviewCase(
    event: OptimizationShadowEvent,
    exclusionReason: string,
  ): Promise<
    | { kind: 'excluded'; reason: string; reviewCase: ShadowReviewCase }
    | { kind: 'exists'; reviewCase: ShadowReviewCase }
  > {
    if (!this.enabled() || !this.prisma) {
      return { kind: 'excluded', reason: exclusionReason, reviewCase: buildExcludedReviewCase(event, exclusionReason) };
    }

    const existing = await this.getReviewCaseByComparisonId(event.comparisonId);
    if (existing) {
      return { kind: 'exists', reviewCase: existing };
    }

    const reviewCaseId = `rev_${randomUUID()}`;
    const frozen = buildExcludedFrozenSnapshots(event);
    const blindPlaceholder = EXCLUDED_PLAN_SNAPSHOT;
    const blindEncrypted = encryptBlindMapping(EXCLUDED_BLIND_MAPPING);
    const now = new Date();

    try {
      await this.prisma.decisionShadowReviewCase.create({
        data: {
          reviewCaseId,
          comparisonId: event.comparisonId,
          tripId: event.tripId,
          decisionRunId: event.decisionRunId,
          status: 'EXCLUDED',
          blindedOptionAJson: blindPlaceholder as unknown as Prisma.InputJsonValue,
          blindedOptionBJson: blindPlaceholder as unknown as Prisma.InputJsonValue,
          frozenSnapshotsJson: frozen as unknown as Prisma.InputJsonValue,
          blindingVersion: SHADOW_BLINDING_VERSION,
          blindMappingEncrypted: blindEncrypted,
          divergenceTypes: event.divergence.types,
          divergenceSeverity: event.divergence.severity,
          eligibilityVersion: SHADOW_ELIGIBILITY_VERSION,
          exclusionReason,
          expectedReviewCount: 0,
          completedReviewCount: 0,
        },
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        const prior = await this.getReviewCaseByComparisonId(event.comparisonId);
        if (prior) return { kind: 'exists', reviewCase: prior };
      }
      throw err;
    }

    const reviewCase = buildExcludedReviewCase(event, exclusionReason, {
      reviewCaseId,
      frozen,
      createdAt: now,
    });
    return { kind: 'excluded', reason: exclusionReason, reviewCase };
  }
}

const EXCLUDED_PLAN_SNAPSHOT: ReviewPlanSnapshot = {
  schemaId: 'tripnara.review_plan_snapshot@v1',
  dayCount: 0,
  slotCount: 0,
  totalDriveMinutes: 0,
  days: [],
  feasibilityLabel: 'UNKNOWN',
};

const EXCLUDED_BLIND_MAPPING: BlindMappingPayload = {
  optionAIs: 'AUTHORITY',
  optionBIs: 'SHADOW',
};

function buildExcludedFrozenSnapshots(
  event: OptimizationShadowEvent,
): { authority: FrozenReviewPlanSnapshot; shadow: FrozenReviewPlanSnapshot } {
  const now = new Date().toISOString();
  const mk = (candidateId: string): FrozenReviewPlanSnapshot => ({
    ...EXCLUDED_PLAN_SNAPSHOT,
    candidateId,
    candidateHash: 'excluded',
    planJson: null,
    constraintSummaryJson: null,
    objectiveScoresJson: null,
    snapshotId: event.snapshotId,
    objectiveVersion: 'excluded',
    strategyVersionHidden: 'excluded',
    createdAt: now,
  });
  return {
    authority: mk(event.authorityResult.selectedCandidateId ?? 'unknown-authority'),
    shadow: mk(event.shadowResult?.selectedCandidateId ?? 'unknown-shadow'),
  };
}

function buildExcludedReviewCase(
  event: OptimizationShadowEvent,
  exclusionReason: string,
  overrides?: {
    reviewCaseId?: string;
    frozen?: { authority: FrozenReviewPlanSnapshot; shadow: FrozenReviewPlanSnapshot };
    createdAt?: Date;
  },
): ShadowReviewCase {
  const frozen = overrides?.frozen ?? buildExcludedFrozenSnapshots(event);
  const createdAt = (overrides?.createdAt ?? new Date()).toISOString();
  return {
    schemaId: 'tripnara.shadow_review_case@v1',
    reviewCaseId: overrides?.reviewCaseId ?? `rev_${randomUUID()}`,
    comparisonId: event.comparisonId,
    decisionRunId: event.decisionRunId,
    tripId: event.tripId,
    status: 'EXCLUDED',
    authorityCandidateId: frozen.authority.candidateId,
    shadowCandidateId: frozen.shadow.candidateId,
    divergenceTypes: event.divergence.types,
    divergenceSeverity: event.divergence.severity,
    eligibleForReview: false,
    exclusionReason,
    blindedOptionA: EXCLUDED_PLAN_SNAPSHOT,
    blindedOptionB: EXCLUDED_PLAN_SNAPSHOT,
    blindMapping: EXCLUDED_BLIND_MAPPING,
    frozenSnapshots: frozen,
    blindingVersion: SHADOW_BLINDING_VERSION,
    expectedReviewCount: 0,
    completedReviewCount: 0,
    reviewAssignments: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function mapCaseRow(
  row: {
    reviewCaseId: string;
    comparisonId: string;
    tripId: string;
    decisionRunId: string;
    status: string;
    blindedOptionAJson: unknown;
    blindedOptionBJson: unknown;
    frozenSnapshotsJson: unknown;
    blindingVersion: string;
    blindMappingEncrypted: string;
    divergenceTypes: string[];
    divergenceSeverity: string;
    eligibilityVersion: string;
    exclusionReason: string | null;
    expectedReviewCount: number;
    completedReviewCount: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    submissions: Array<{
      submissionId: string;
      reviewerId: string;
      preferredOption: string;
      classification: string;
      scoresJson: unknown;
      tradeOffSummary: string | null;
      confidence: number | null;
      createdAt: Date;
    }>;
  },
): ShadowReviewCase {
  const frozen = row.frozenSnapshotsJson as {
    authority: FrozenReviewPlanSnapshot;
    shadow: FrozenReviewPlanSnapshot;
  };
  const mapping = decryptBlindMapping(row.blindMappingEncrypted);

  return {
    schemaId: 'tripnara.shadow_review_case@v1',
    reviewCaseId: row.reviewCaseId,
    comparisonId: row.comparisonId,
    decisionRunId: row.decisionRunId,
    tripId: row.tripId,
    status: row.status as ShadowReviewCaseStatus,
    authorityCandidateId: frozen.authority.candidateId,
    shadowCandidateId: frozen.shadow.candidateId,
    divergenceTypes: row.divergenceTypes as ShadowReviewCase['divergenceTypes'],
    divergenceSeverity: row.divergenceSeverity as ShadowReviewCase['divergenceSeverity'],
    eligibleForReview: row.status !== 'EXCLUDED',
    exclusionReason: row.exclusionReason ?? undefined,
    blindedOptionA: row.blindedOptionAJson as ShadowReviewCase['blindedOptionA'],
    blindedOptionB: row.blindedOptionBJson as ShadowReviewCase['blindedOptionB'],
    blindMapping: mapping,
    frozenSnapshots: frozen,
    blindingVersion: row.blindingVersion,
    expectedReviewCount: row.expectedReviewCount,
    completedReviewCount: row.completedReviewCount,
    reviewAssignments: row.submissions.map(mapSubmissionRow),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapSubmissionRow(s: {
  reviewerId: string;
  preferredOption: string;
  classification: string;
  scoresJson: unknown;
  tradeOffSummary: string | null;
  confidence: number | null;
  createdAt: Date;
}): ReviewAssignment {
  return {
    reviewerId: s.reviewerId,
    preferredOption: s.preferredOption as ReviewPreferredOption,
    classification: s.classification as ManualReviewVerdict,
    scores: s.scoresJson as ReviewAssignment['scores'],
    tradeOffSummary: s.tradeOffSummary ?? '',
    confidence: s.confidence ?? 1,
    submittedAt: s.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
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

function emptySeverityCounts() {
  return { NONE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
}

function emptyStats(): ShadowReviewStatsSnapshot {
  return {
    schemaId: 'tripnara.shadow_review_stats@v1',
    collectedAt: new Date().toISOString(),
    totalCases: 0,
    byStatus: emptyStatusCounts(),
    byClassification: emptyClassificationCounts(),
    byDivergenceType: {},
    bySeverity: emptySeverityCounts(),
    completedReviews: 0,
  };
}
