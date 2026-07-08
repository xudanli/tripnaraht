/**
 * Impact propagation — direct + derived member attribution (P1).
 */

import type {
  AffectedScope,
  ConstraintAssertion,
  MemberImpact,
  MemberImpactType,
} from '../types/decision-semantics.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';

function severityFromIssue(issue: FeasibilityIssueDto): AffectedScope['severity'] {
  if (issue.severity === 'high') return 'HIGH';
  if (issue.severity === 'medium') return 'MEDIUM';
  return 'LOW';
}

function dayScopes(issue: FeasibilityIssueDto): AffectedScope[] {
  const dayCandidates = new Set<number>();
  for (const day of issue.affectedDays ?? []) {
    if (Number.isFinite(day) && day > 0) dayCandidates.add(day);
  }
  for (const day of issue.affectedDayNumbers ?? []) {
    if (Number.isFinite(day) && day > 0) dayCandidates.add(day);
  }
  if (issue.anchors?.fromDayNumber != null && issue.anchors.fromDayNumber > 0) {
    dayCandidates.add(issue.anchors.fromDayNumber);
  }
  if (issue.anchors?.toDayNumber != null && issue.anchors.toDayNumber > 0) {
    dayCandidates.add(issue.anchors.toDayNumber);
  }
  const days = [...dayCandidates];
  return days.map((day) => ({
    scopeType: 'DAY' as const,
    scopeId: String(day),
    impactType: issue.priority === 'must_handle' ? ('BLOCKED' as MemberImpactType) : ('DELAYED' as MemberImpactType),
    severity: severityFromIssue(issue),
    explanation: issue.message,
  }));
}

function itemScopes(issue: FeasibilityIssueDto): AffectedScope[] {
  const scopes: AffectedScope[] = [];
  if (issue.fromItemId) {
    scopes.push({
      scopeType: 'ITINERARY_ITEM',
      scopeId: issue.fromItemId,
      impactType: 'DELAYED',
      severity: severityFromIssue(issue),
      explanation: issue.message,
    });
  }
  if (issue.toItemId && issue.toItemId !== issue.fromItemId) {
    scopes.push({
      scopeType: 'ITINERARY_ITEM',
      scopeId: issue.toItemId,
      impactType: issue.priority === 'must_handle' ? 'BLOCKED' : 'DELAYED',
      severity: severityFromIssue(issue),
      explanation: issue.message,
    });
  }
  if (issue.fromItemId && issue.toItemId) {
    scopes.push({
      scopeType: 'JOURNEY_LEG',
      scopeId: `${issue.fromItemId}->${issue.toItemId}`,
      impactType: issue.issueKind?.includes('drive') ? 'FATIGUE_INCREASED' : 'DELAYED',
      severity: severityFromIssue(issue),
      explanation: issue.message,
    });
  }
  return scopes;
}

function directMemberScopes(issue: FeasibilityIssueDto): AffectedScope[] {
  const memberIds = issue.uiHints?.affectedMemberIds;
  if (!memberIds?.length) return [];

  return memberIds.map((memberId) => ({
    scopeType: 'MEMBER' as const,
    scopeId: memberId,
    impactType: (issue.category === 'team_fit'
      ? 'PREFERENCE_UNSATISFIED'
      : 'FATIGUE_INCREASED') as MemberImpactType,
    severity: severityFromIssue(issue),
    explanation: issue.message,
    memberImpacts: [
      {
        memberId,
        impactType: issue.category === 'team_fit' ? 'PREFERENCE_UNSATISFIED' : 'FATIGUE_INCREASED',
        explanation: issue.message,
        confidence: 0.95,
      } satisfies MemberImpact,
    ],
  }));
}

/** Derive member impacts from journey-leg delay + soft time/energy constraints (rule v1). */
function deriveMemberImpactsFromLegDelay(
  issue: FeasibilityIssueDto,
  assertion: ConstraintAssertion,
): MemberImpact[] {
  const shortfall = issue.anchors?.shortfallMinutes;
  const arriveAt = issue.anchors?.arriveAt;
  if (!shortfall && !arriveAt) return [];

  const impacts: MemberImpact[] = [];
  const legId = issue.fromItemId && issue.toItemId ? `${issue.fromItemId}->${issue.toItemId}` : undefined;

  if (typeof shortfall === 'number' && shortfall >= 60) {
    impacts.push({
      memberId: '__derived:primary_driver__',
      derivedFrom: legId ? [`leg:${legId}`, 'rule:drive_duration'] : ['rule:drive_duration'],
      impactType: 'FATIGUE_INCREASED',
      explanation: `预计驾驶/转移时间增加，主驾驶疲劳风险上升（+${shortfall} 分钟）`,
      confidence: 0.72,
    });
  }

  if (arriveAt && /2[0-9]:|2[0-9]/.test(arriveAt)) {
    impacts.push({
      memberId: '__derived:late_rest_sensitive__',
      derivedFrom: legId ? [`leg:${legId}`, 'rule:late_arrival'] : ['rule:late_arrival'],
      impactType: 'DELAYED',
      explanation: `预计到达 ${arriveAt}，可能晚于成员休息/入住偏好`,
      confidence: 0.65,
    });
  }

  if (assertion.nature === 'RISK_PREDICTION' && assertion.domain === 'WEATHER') {
    impacts.push({
      memberId: '__derived:all_travelers__',
      derivedFrom: ['rule:weather_exposure'],
      impactType: 'SAFETY_EXPOSURE',
      explanation: assertion.conclusion,
      confidence: 0.7,
    });
  }

  return impacts;
}

export function propagateAffectedScopes(
  issue: FeasibilityIssueDto,
  assertion: ConstraintAssertion,
): AffectedScope[] {
  const scopes: AffectedScope[] = [
    ...dayScopes(issue),
    ...itemScopes(issue),
    ...directMemberScopes(issue),
  ];

  const derived = deriveMemberImpactsFromLegDelay(issue, assertion);
  if (derived.length > 0) {
    scopes.push({
      scopeType: 'TRIP',
      scopeId: issue.tripDayId ?? 'trip',
      impactType: derived.some((d) => d.impactType === 'SAFETY_EXPOSURE') ? 'SAFETY_EXPOSURE' : 'DELAYED',
      severity: severityFromIssue(issue),
      explanation: issue.message,
      memberImpacts: derived,
    });
  }

  if (!scopes.length) {
    scopes.push({
      scopeType: 'TRIP',
      scopeId: 'trip',
      impactType: issue.priority === 'must_handle' ? 'BLOCKED' : 'DELAYED',
      severity: severityFromIssue(issue),
      explanation: issue.message,
    });
  }

  return scopes;
}
