/**
 * WP1 — compare Legacy orchestrator output vs RFC-001 canonical chain.
 */

import { Injectable } from '@nestjs/common';
import type {
  ShadowComparisonAggregate,
  ShadowComparisonDiff,
  ShadowComparisonMetrics,
  ShadowComparisonResult,
  ShadowDecisionSnapshot,
  ShadowDiffKind,
} from './shadow-decision-snapshot.types';

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

function intersect(a: string[], b: string[]): string[] {
  const sb = new Set(b);
  return [...new Set(a)].filter((x) => sb.has(x));
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function normalizeFinalAction(
  action: string,
  allowed: boolean,
): ShadowDecisionSnapshot['finalAction'] {
  if (!allowed && action === 'REJECT') return 'REJECT';
  if (action === 'DEFER_TO_HUMAN') return 'DEFER_TO_HUMAN';
  if (action === 'REPLACE') return 'REPLACE';
  if (action === 'ADJUST') return 'ADJUST';
  if (action === 'ALLOW') return 'ALLOW';
  if (!allowed) return 'REJECT';
  return 'NO_DECISION';
}

function mapToEligibility(snapshot: ShadowDecisionSnapshot): boolean {
  if (snapshot.hardBlockOnOriginal && !snapshot.selectedCandidateId) {
    return snapshot.candidateIds.some((id) => id !== 'original');
  }
  return snapshot.allowed || Boolean(snapshot.selectedCandidateId);
}

@Injectable()
export class LegacyRfc001ComparatorService {
  compare(input: {
    tripId: string;
    eventId: string;
    legacy: ShadowDecisionSnapshot;
    rfc001: ShadowDecisionSnapshot;
  }): ShadowComparisonResult {
    const metrics = this.buildMetrics(input.legacy, input.rfc001);
    const diff = this.classifyDiff(input.legacy, input.rfc001, metrics);

    return {
      schemaId: 'tripnara.rfc001_shadow_comparison@v1',
      tripId: input.tripId,
      eventId: input.eventId,
      comparedAt: new Date().toISOString(),
      legacy: input.legacy,
      rfc001: input.rfc001,
      metrics,
      diff,
    };
  }

  aggregate(results: ShadowComparisonResult[]): ShadowComparisonAggregate {
    if (results.length === 0) {
      return {
        sampleCount: 0,
        decisionAgreementRate: 0,
        hardBlockAgreementRate: 0,
        affectedScopeAgreementRate: 0,
        meanCandidateOverlapRate: 0,
        meanReasonCodeCoverage: 0,
        executionEligibilityAgreementRate: 0,
        latencyLegacyP50Ms: 0,
        latencyRfc001P50Ms: 0,
        diffKindCounts: {},
      };
    }

    const diffKindCounts: Partial<Record<ShadowDiffKind, number>> = {};
    let decisionAgree = 0;
    let hardBlockAgree = 0;
    let scopeAgree = 0;
    let execAgree = 0;
    let candOverlapSum = 0;
    let reasonCovSum = 0;
    const legacyLatencies = results.map((r) => r.legacy.latencyMs).sort((a, b) => a - b);
    const rfcLatencies = results.map((r) => r.rfc001.latencyMs).sort((a, b) => a - b);

    for (const r of results) {
      if (r.metrics.decisionAgreement) decisionAgree += 1;
      if (r.metrics.hardBlockAgreement) hardBlockAgree += 1;
      if (r.metrics.affectedScopeAgreement) scopeAgree += 1;
      if (r.metrics.executionEligibilityAgreement) execAgree += 1;
      candOverlapSum += r.metrics.candidateOverlapRate;
      reasonCovSum += r.metrics.reasonCodeCoverage;
      diffKindCounts[r.diff.kind] = (diffKindCounts[r.diff.kind] ?? 0) + 1;
    }

    const p50 = (sorted: number[]) => sorted[Math.floor(sorted.length / 2)] ?? 0;

    return {
      sampleCount: results.length,
      decisionAgreementRate: decisionAgree / results.length,
      hardBlockAgreementRate: hardBlockAgree / results.length,
      affectedScopeAgreementRate: scopeAgree / results.length,
      meanCandidateOverlapRate: candOverlapSum / results.length,
      meanReasonCodeCoverage: reasonCovSum / results.length,
      executionEligibilityAgreementRate: execAgree / results.length,
      latencyLegacyP50Ms: p50(legacyLatencies),
      latencyRfc001P50Ms: p50(rfcLatencies),
      diffKindCounts,
    };
  }

  buildMetrics(
    legacy: ShadowDecisionSnapshot,
    rfc001: ShadowDecisionSnapshot,
  ): ShadowComparisonMetrics {
    const scopeJaccard = jaccard(legacy.affectedPlanItemIds, rfc001.affectedPlanItemIds);
    const candidateIntersection = intersect(legacy.candidateIds, rfc001.candidateIds);
    const candidateUnion = union(legacy.candidateIds, rfc001.candidateIds);
    const reasonCodeOverlap = intersect(legacy.reasonCodes, rfc001.reasonCodes);
    const reasonUnion = union(legacy.reasonCodes, rfc001.reasonCodes);

    const legacyNorm = normalizeFinalAction(legacy.finalAction, legacy.allowed);
    const rfcNorm = normalizeFinalAction(rfc001.finalAction, rfc001.allowed);
    const decisionAgreement =
      legacyNorm === rfcNorm ||
      (legacyNorm === 'REJECT' && rfcNorm === 'DEFER_TO_HUMAN') ||
      (legacyNorm === 'DEFER_TO_HUMAN' && rfcNorm === 'REPLACE');

    return {
      decisionAgreement,
      hardBlockAgreement: legacy.hardBlockOnOriginal === rfc001.hardBlockOnOriginal,
      affectedScopeAgreement: scopeJaccard >= 0.999,
      affectedScopeJaccard: scopeJaccard,
      candidateIntersection,
      candidateUnion,
      candidateOverlapRate:
        candidateUnion.length === 0
          ? 1
          : candidateIntersection.length / candidateUnion.length,
      reasonCodeOverlap,
      reasonCodeCoverage:
        reasonUnion.length === 0 ? 1 : reasonCodeOverlap.length / reasonUnion.length,
      executionEligibilityAgreement:
        mapToEligibility(legacy) === mapToEligibility(rfc001),
    };
  }

  classifyDiff(
    legacy: ShadowDecisionSnapshot,
    rfc001: ShadowDecisionSnapshot,
    metrics: ShadowComparisonMetrics,
  ): ShadowComparisonDiff {
    const details: string[] = [];

    if (!metrics.affectedScopeAgreement) {
      return {
        kind: 'INPUT_INCONSISTENCY',
        summary: 'Affected PlanItem sets differ — fix snapshot / impact binding first',
        details: [
          `legacy items=${legacy.affectedPlanItemIds.join(',')}`,
          `rfc001 items=${rfc001.affectedPlanItemIds.join(',')}`,
          `jaccard=${metrics.affectedScopeJaccard.toFixed(3)}`,
        ],
      };
    }

    if (
      metrics.decisionAgreement &&
      metrics.hardBlockAgreement &&
      metrics.candidateOverlapRate >= 0.5
    ) {
      return {
        kind: 'AGREEMENT',
        summary: 'Legacy and RFC-001 agree on core decision shape',
        details,
      };
    }

    if (rfc001.hardBlockOnOriginal && !legacy.hardBlockOnOriginal) {
      details.push('RFC blocks original; legacy does not');
      return {
        kind: 'RFC_PREFERRED',
        summary: 'RFC chain is more conservative on original plan (likely correct for hard road closure)',
        details,
      };
    }

    if (legacy.hardBlockOnOriginal && !rfc001.hardBlockOnOriginal) {
      details.push('Legacy blocks original; RFC does not');
      return {
        kind: 'LEGACY_PREFERRED',
        summary: 'Legacy caught a hard block missed by RFC chain',
        details,
      };
    }

    if (!metrics.decisionAgreement) {
      details.push(
        `finalAction legacy=${legacy.finalAction} rfc001=${rfc001.finalAction}`,
      );
    }
    if (metrics.candidateOverlapRate === 0 && rfc001.candidateIds.length > 0) {
      details.push('No overlapping repair candidates');
      return {
        kind: 'STRATEGY_DIFFERENCE',
        summary: 'Candidate sets are disjoint — strategy or generation method differs',
        details,
      };
    }

    if (!metrics.decisionAgreement || !metrics.hardBlockAgreement) {
      return {
        kind: 'STRATEGY_DIFFERENCE',
        summary: 'Both chains plausible but differ on action or block semantics',
        details,
      };
    }

    return {
      kind: 'INDETERMINATE',
      summary: 'Requires human expert review',
      details,
    };
  }

  /** Extract comparable snapshot from StrategyOrchestrator.run result */
  snapshotFromLegacyOrchestrator(input: {
    result: {
      allowed: boolean;
      finalAction: string;
      plan: { segments?: Array<{ metadata?: Record<string, unknown> }> } | null;
      logs: Array<{ reasonCodes?: string[] }>;
    };
    basePlan: { segments?: Array<{ metadata?: Record<string, unknown> }> };
    affectedPlanItemIds: string[];
    latencyMs: number;
  }): ShadowDecisionSnapshot {
    const reasonCodes = input.result.logs.flatMap((l) => l.reasonCodes ?? []);
    const baseItemIds = new Set(
      (input.basePlan.segments ?? [])
        .map((s) => s.metadata?.itineraryItemId as string | undefined)
        .filter(Boolean) as string[],
    );
    const outItemIds = new Set(
      (input.result.plan?.segments ?? [])
        .map((s) => s.metadata?.itineraryItemId as string | undefined)
        .filter(Boolean) as string[],
    );
    const hasPlanMutation =
      input.result.plan != null &&
      (baseItemIds.size !== outItemIds.size ||
        [...baseItemIds].some((id) => !outItemIds.has(id)));

    const candidateIds = hasPlanMutation ? ['legacy_updated_plan'] : [];

    return {
      source: 'legacy',
      finalAction: normalizeFinalAction(
        input.result.finalAction,
        input.result.allowed,
      ),
      allowed: input.result.allowed,
      hardBlockOnOriginal: !input.result.allowed && input.result.finalAction === 'REJECT',
      affectedPlanItemIds: input.affectedPlanItemIds,
      candidateIds,
      reasonCodes: [...new Set(reasonCodes)],
      hasPlanMutation,
      latencyMs: input.latencyMs,
    };
  }

  /** Extract comparable snapshot from RFC-001 runner output */
  snapshotFromRfc001Run(input: {
    affectedPlanItemIds: string[];
    record: {
      finalAction: string;
      selectedCandidateId?: string;
      reasonCodes: string[];
    } | null;
    workspace: {
      constraintAssertions: Array<{
        targetCandidateId?: string;
        verdict: string;
        overridable: boolean;
      }>;
      repairCandidates: Array<{ candidateId: string }>;
    } | null;
    latencyMs: number;
  }): ShadowDecisionSnapshot {
    const hardBlockOnOriginal = Boolean(
      input.workspace?.constraintAssertions.some(
        (a) =>
          a.targetCandidateId === 'original' &&
          a.verdict === 'BLOCK' &&
          !a.overridable,
      ),
    );
    const candidateIds =
      input.workspace?.repairCandidates.map((c) => c.candidateId) ?? [];

    return {
      source: 'rfc001',
      finalAction: input.record
        ? normalizeFinalAction(input.record.finalAction, true)
        : 'NO_DECISION',
      allowed: Boolean(input.record && input.record.finalAction !== 'REJECT'),
      hardBlockOnOriginal,
      affectedPlanItemIds: input.affectedPlanItemIds,
      candidateIds,
      selectedCandidateId: input.record?.selectedCandidateId,
      reasonCodes: input.record?.reasonCodes ?? [],
      hasPlanMutation: Boolean(input.record?.selectedCandidateId && input.record.selectedCandidateId !== 'original'),
      latencyMs: input.latencyMs,
    };
  }
}
