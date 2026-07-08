/**
 * Canonical L2 problems without evaluate/workspace → feasibility-backed repair options.
 */

import type { CollectedDecisionProblems } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';

export function findFeasibilityIssueForCanonicalRow(
  collected: CollectedDecisionProblems,
  row: InternalUnifiedProblemRow,
): FeasibilityIssueDto | undefined {
  const semanticKey = row.semanticKey;
  const itemIds = new Set(row.scope.itemIds ?? []);
  const routeIds = new Set(row.scope.routeSegmentIds ?? []);
  const dayIds = new Set(row.scope.dayIds ?? []);

  const scored = collected.feasibilityIssues
    .map((issue) => ({
      issue,
      score: scoreIssueMatch(issue, { semanticKey, itemIds, routeIds, dayIds }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.issue;
}

function scoreIssueMatch(
  issue: FeasibilityIssueDto,
  ctx: {
    semanticKey: string;
    itemIds: Set<string>;
    routeIds: Set<string>;
    dayIds: Set<number>;
  },
): number {
  let capabilityScore = 0;

  if (issue.semanticKey && issue.semanticKey === ctx.semanticKey) {
    capabilityScore = Math.max(capabilityScore, 100);
  }

  if (ctx.semanticKey === 'ROAD_SEGMENT_UNAVAILABLE') {
    if (issue.semanticKey === 'ROAD_SEGMENT_UNAVAILABLE') capabilityScore = Math.max(capabilityScore, 90);
    if (issue.issueKind === 'road_class' || issue.issueKind === 'road_segment') {
      capabilityScore = Math.max(capabilityScore, 70);
    }
    if (issue.issueKind === 'ROAD_CLOSED') capabilityScore = Math.max(capabilityScore, 75);
    if (issue.semanticKey?.includes('ROAD_CLOSED')) capabilityScore = Math.max(capabilityScore, 70);
    if (issue.id?.includes('anchor:transport')) capabilityScore = Math.max(capabilityScore, 65);
    if (/road|f208|路段|封闭/i.test(`${issue.title} ${issue.message}`)) {
      capabilityScore = Math.max(capabilityScore, 40);
    }
  }

  if (ctx.semanticKey === 'EXCESSIVE_DAILY_LOAD') {
    if (issue.issueKind === 'daily_drive') capabilityScore = Math.max(capabilityScore, 85);
    if (/驾驶|负荷|daily/i.test(`${issue.title} ${issue.message}`)) {
      capabilityScore = Math.max(capabilityScore, 50);
    }
  }

  if (capabilityScore === 0) return 0;

  let score = capabilityScore;

  if (issue.fromItemId && ctx.itemIds.has(issue.fromItemId)) score += 50;
  if (issue.toItemId && ctx.itemIds.has(issue.toItemId)) score += 50;
  if (issue.proofs?.some((p) => p.itemId && ctx.itemIds.has(p.itemId))) score += 35;

  if (issue.affectedDays?.some((d) => ctx.dayIds.has(d))) score += 25;

  if (
    issue.proofs?.some((p) =>
      ctx.routeIds.has(String(p.entity)) || ctx.routeIds.has(String(p.ruleId)),
    )
  ) {
    score += 30;
  }

  return score;
}
