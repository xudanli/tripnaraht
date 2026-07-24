/**
 * 从 Feasibility P0 issues 提取 TripPrerequisite SSOT
 */

import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  TripPrerequisite,
  TripPrerequisiteKind,
  TripPrerequisiteStatus,
} from '../types/trip-prerequisite.types';
import {
  buildExperienceRegretFeasibilityIssueId,
  buildExperienceRegretPrerequisiteId,
  buildPoiAccessFeasibilityIssueId,
  buildPoiAccessPrerequisiteId,
} from './prerequisite-id.util';

const PREREQUISITE_ISSUE_KINDS = new Set([
  'poi_access_reservation_required',
  'poi_access_blocked',
  'experience_regret_unconfirmed',
]);

export function isPrerequisiteBackedIssue(issue: FeasibilityIssueDto): boolean {
  if (issue.prerequisiteId) return true;
  const kind = issue.issueKind ?? '';
  return PREREQUISITE_ISSUE_KINDS.has(kind);
}

function kindFromIssueKind(issueKind: string): TripPrerequisiteKind {
  switch (issueKind) {
    case 'poi_access_reservation_required':
      return 'poi_access_reservation';
    case 'poi_access_blocked':
      return 'poi_access_blocked';
    case 'experience_regret_unconfirmed':
      return 'experience_regret_confirmation';
    default:
      return 'other';
  }
}

function defaultStatusFromIssue(issue: FeasibilityIssueDto): TripPrerequisiteStatus {
  if (issue.visitorAccess?.hasReservationEvidence) return 'CONFIRMED';
  return 'UNCONFIRMED';
}

function resolvePrerequisiteId(issue: FeasibilityIssueDto, tripId: string): string {
  if (issue.prerequisiteId) return issue.prerequisiteId;
  const kind = issue.issueKind ?? '';
  if (kind === 'experience_regret_unconfirmed') {
    return buildExperienceRegretPrerequisiteId(tripId);
  }
  if (issue.fromItemId && kind.startsWith('poi_access_')) {
    return buildPoiAccessPrerequisiteId(issue.fromItemId, kind);
  }
  return `prereq:issue:${issue.id}`;
}

function resolveFeasibilityIssueId(issue: FeasibilityIssueDto, tripId: string): string {
  const kind = issue.issueKind ?? '';
  if (kind === 'experience_regret_unconfirmed') {
    return buildExperienceRegretFeasibilityIssueId(tripId);
  }
  if (issue.fromItemId && kind.startsWith('poi_access_')) {
    return buildPoiAccessFeasibilityIssueId(issue.fromItemId, kind);
  }
  return issue.id;
}

function prepLevelFromIssue(issue: FeasibilityIssueDto): 'blocker' | 'must' | 'should' {
  if (issue.priority === 'must_handle') {
    return issue.issueKind === 'poi_access_blocked' ? 'blocker' : 'must';
  }
  if (issue.priority === 'pending_confirm') return 'should';
  return 'should';
}

export function extractPrerequisiteFromIssue(
  issue: FeasibilityIssueDto,
  tripId: string,
  now = new Date().toISOString(),
): TripPrerequisite | undefined {
  if (!isPrerequisiteBackedIssue(issue)) return undefined;

  const issueKind = issue.issueKind ?? '';
  const prerequisiteId = resolvePrerequisiteId(issue, tripId);
  const feasibilityIssueId = resolveFeasibilityIssueId(issue, tripId);
  const dayNumber = issue.affectedDays?.[0];
  const poiName = issue.title.split('：')[0]?.trim();

  const sourceSystem =
    issueKind === 'experience_regret_unconfirmed' ? 'experience_regret' : 'poi_access';

  return {
    id: prerequisiteId,
    tripId,
    kind: kindFromIssueKind(issueKind),
    title:
      issueKind === 'experience_regret_unconfirmed'
        ? '确认体验底线'
        : issueKind === 'poi_access_reservation_required'
          ? `确认预约：${poiName || '活动'}`
          : issue.title,
    description: issue.message,
    status: defaultStatusFromIssue(issue),
    relatedActivity: issue.fromItemId
      ? {
          tripItemId: issue.fromItemId,
          tripDayId: issue.tripDayId,
          poiId: issue.visitorAccess?.evaluation?.poiId,
          poiName,
          dayNumber,
        }
      : undefined,
    source: {
      system: sourceSystem,
      feasibilityIssueId,
    },
    projections: {
      departurePrep: {
        findingItemId: prerequisiteId,
        level: prepLevelFromIssue(issue),
        category: 'activities_bookings',
      },
      feasibility: {
        issueId: feasibilityIssueId,
        issueKind,
      },
    },
    updatedAt: now,
  };
}

export function extractPrerequisitesFromIssues(
  tripId: string,
  issues: FeasibilityIssueDto[],
  now = new Date().toISOString(),
): TripPrerequisite[] {
  const byId = new Map<string, TripPrerequisite>();
  for (const issue of issues) {
    const prereq = extractPrerequisiteFromIssue(issue, tripId, now);
    if (!prereq) continue;
    byId.set(prereq.id, prereq);
  }
  return [...byId.values()];
}

export function applyPrerequisiteUserState(
  prerequisites: TripPrerequisite[],
  input: {
    checkedIds: Set<string>;
    notApplicableIds: Set<string>;
    confirmedAtById?: Map<string, string>;
  },
): TripPrerequisite[] {
  return prerequisites.map((p) => {
    if (input.notApplicableIds.has(p.id)) {
      return { ...p, status: 'NOT_APPLICABLE' as const };
    }
    if (p.status === 'CONFIRMED') {
      return p;
    }
    if (input.checkedIds.has(p.id)) {
      return {
        ...p,
        status: 'CONFIRMED',
        confirmedAt: input.confirmedAtById?.get(p.id) ?? new Date().toISOString(),
      };
    }
    return p;
  });
}

export function summarizePrerequisites(prerequisites: TripPrerequisite[]): {
  total: number;
  open: number;
  confirmed: number;
  notApplicable: number;
} {
  let open = 0;
  let confirmed = 0;
  let notApplicable = 0;
  for (const p of prerequisites) {
    if (p.status === 'CONFIRMED') confirmed += 1;
    else if (p.status === 'NOT_APPLICABLE') notApplicable += 1;
    else open += 1;
  }
  return {
    total: prerequisites.length,
    open,
    confirmed,
    notApplicable,
  };
}
