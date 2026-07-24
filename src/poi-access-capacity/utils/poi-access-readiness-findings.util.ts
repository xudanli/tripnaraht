/**
 * Feasibility P0 issues → ReadinessScoreFinding
 */

import type { ReadinessScoreFinding } from '../../trips/readiness/types/coverage-map.types';
import type { ReadinessFindingItem } from '../../trips/readiness/types/readiness-findings.types';
import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { VisitorAccessPayload } from '../types/poi-access-readiness.types';

export function feasibilityIssueToReadinessFinding(
  issue: FeasibilityIssueDto,
): ReadinessScoreFinding {
  let type: ReadinessScoreFinding['type'] = 'must';
  if (issue.priority === 'must_handle') {
    type = issue.issueKind === 'poi_access_blocked' ? 'blocker' : 'must';
  } else if (issue.priority === 'pending_confirm') {
    type = 'should';
  } else {
    type = 'should';
  }

  const visitorAccess = issue.visitorAccess as VisitorAccessPayload | undefined;

  return {
    id: issue.id,
    type,
    category:
      issue.category === 'experience_expectation' ? 'experience_expectation' : 'access_capacity',
    message: issue.message,
    severity: issue.severity,
    affectedDays: issue.affectedDays,
    actionRequired: issue.actionRequired,
    fromItemId: issue.fromItemId,
    toItemId: issue.toItemId,
    issueKind: issue.issueKind,
    anchors: issue.anchors as Record<string, unknown> | undefined,
    uiHints: issue.uiHints as Record<string, unknown> | undefined,
    visitorAccess: visitorAccess
      ? {
          evaluation: visitorAccess.evaluation,
          hasReservationEvidence: visitorAccess.hasReservationEvidence,
          deferredLive: visitorAccess.deferredLive,
        }
      : undefined,
  };
}

function scoreFindingLevel(
  type: ReadinessScoreFinding['type'],
): ReadinessFindingItem['level'] {
  if (type === 'blocker') return 'blocker';
  if (type === 'must' || type === 'warning') return 'must';
  return 'should';
}

/** ReadinessScoreFinding → 树形 findings[].blockers|must|should 条目 */
export function scoreFindingToTreeItem(finding: ReadinessScoreFinding): ReadinessFindingItem {
  const poiId = finding.visitorAccess?.evaluation.poiId;
  const day = finding.affectedDays?.[0];

  return {
    id: finding.id,
    category:
      finding.category === 'experience_expectation' ? 'activities_bookings' : 'activities_bookings',
    severity: finding.severity,
    level: scoreFindingLevel(finding.type),
    message: finding.message,
    tasks: finding.actionRequired ? [{ title: finding.actionRequired }] : undefined,
    tripScope:
      poiId && day
        ? {
            kind: 'poi',
            day,
            fromPoi: { id: poiId, name: finding.message.split('：')[0] ?? poiId },
          }
        : undefined,
    visitorAccess: finding.visitorAccess,
    issueKind: finding.issueKind,
  };
}
