/**
 * Prerequisite → 出发准备 / Feasibility 双投影
 */

import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { ReadinessFindingItem, ReadinessCheckResult } from '../../readiness/types/readiness-findings.types';
import type { TripPrerequisite } from '../types/trip-prerequisite.types';

export function projectPrerequisiteToDeparturePrepItem(
  prerequisite: TripPrerequisite,
): ReadinessFindingItem {
  const { departurePrep } = prerequisite.projections;
  const day = prerequisite.relatedActivity?.dayNumber;
  const poiId = prerequisite.relatedActivity?.poiId;
  const poiName = prerequisite.relatedActivity?.poiName;

  return {
    id: departurePrep.findingItemId,
    prerequisiteId: prerequisite.id,
    category: departurePrep.category,
    severity: departurePrep.level === 'blocker' ? 'high' : 'medium',
    level: departurePrep.level,
    message: prerequisite.description ?? prerequisite.title,
    tasks: [{ title: prerequisite.title }],
    issueKind: prerequisite.projections.feasibility?.issueKind,
    tripScope:
      poiId && day
        ? {
            kind: 'poi',
            day,
            fromPoi: { id: poiId, name: poiName ?? poiId },
          }
        : undefined,
  };
}

export function projectOpenPrerequisitesToDeparturePrepItems(
  prerequisites: TripPrerequisite[],
): ReadinessFindingItem[] {
  return prerequisites
    .filter((p) => p.status !== 'CONFIRMED' && p.status !== 'NOT_APPLICABLE')
    .map(projectPrerequisiteToDeparturePrepItem);
}

export function enrichFeasibilityIssueWithPrerequisiteId(
  issue: FeasibilityIssueDto,
  prerequisitesByIssueId: Map<string, TripPrerequisite>,
): FeasibilityIssueDto {
  if (issue.prerequisiteId) return issue;
  const linked =
    prerequisitesByIssueId.get(issue.id) ??
    (issue.fromItemId && issue.issueKind
      ? [...prerequisitesByIssueId.values()].find(
          (p) =>
            p.projections.feasibility?.issueId === issue.id ||
            (p.relatedActivity?.tripItemId === issue.fromItemId &&
              p.projections.feasibility?.issueKind === issue.issueKind),
        )
      : undefined) ??
    prerequisitesByIssueId.get(
      issue.issueKind === 'experience_regret_unconfirmed'
        ? `experience-regret:unconfirmed:${issue.id.split(':').pop() ?? ''}`
        : issue.id,
    );
  if (!linked) return issue;
  return { ...issue, prerequisiteId: linked.id };
}

export function enrichFeasibilityIssuesWithPrerequisiteIds(
  tripId: string,
  issues: FeasibilityIssueDto[],
  prerequisites: TripPrerequisite[],
): FeasibilityIssueDto[] {
  const byIssueId = new Map<string, TripPrerequisite>();
  for (const p of prerequisites) {
    const issueId = p.projections.feasibility?.issueId ?? p.source.feasibilityIssueId;
    if (issueId) byIssueId.set(issueId, p);
    byIssueId.set(p.id, p);
  }
  return issues.map((issue) => enrichFeasibilityIssueWithPrerequisiteId(issue, byIssueId));
}

export function mergePrerequisitePrepItemsIntoReadinessTree(input: {
  destinationId: string;
  result: ReadinessCheckResult;
  prepItems: ReadinessFindingItem[];
}): ReadinessCheckResult {
  if (input.prepItems.length === 0) return input.result;

  const existingIds = new Set<string>();
  for (const f of input.result.findings) {
    for (const item of [...f.blockers, ...f.must, ...f.should, ...f.optional]) {
      existingIds.add(item.id);
    }
  }

  const blockers: ReadinessFindingItem[] = [];
  const must: ReadinessFindingItem[] = [];
  const should: ReadinessFindingItem[] = [];

  for (const item of input.prepItems) {
    if (existingIds.has(item.id)) continue;
    if (item.level === 'blocker') blockers.push(item);
    else if (item.level === 'must') must.push(item);
    else should.push(item);
  }

  if (blockers.length === 0 && must.length === 0 && should.length === 0) {
    return input.result;
  }

  let findings = input.result.findings;
  if (findings.length === 0) {
    findings = [
      {
        destinationId: input.destinationId,
        packId: 'internal.trip-prerequisites',
        packVersion: '1',
        blockers,
        must,
        should,
        optional: [],
        risks: [],
      },
    ];
  } else {
    const matchIdx = findings.findIndex((f) => f.destinationId === input.destinationId);
    const idx = matchIdx >= 0 ? matchIdx : 0;
    findings = findings.map((f, i) =>
      i === idx
        ? {
            ...f,
            blockers: [...f.blockers, ...blockers],
            must: [...f.must, ...must],
            should: [...f.should, ...should],
          }
        : f,
    );
  }

  return {
    ...input.result,
    findings,
    summary: {
      ...input.result.summary,
      totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
      totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
      totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
      totalOptional: findings.reduce((sum, f) => sum + (f.optional?.length ?? 0), 0),
      totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
    },
  };
}
