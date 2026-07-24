/** 稳定 prerequisiteId — 与 feasibility issue id 分离 */

export function buildPoiAccessPrerequisiteId(tripItemId: string, issueKind: string): string {
  return `prereq:poi-access:${tripItemId}:${issueKind}`;
}

export function buildExperienceRegretPrerequisiteId(tripId: string): string {
  return `prereq:experience-regret:${tripId}`;
}

export function buildPackPrerequisiteId(packRuleId: string): string {
  return `prereq:pack:${packRuleId}`;
}

/** feasibility P0 issue id（历史稳定键） */
export function buildPoiAccessFeasibilityIssueId(tripItemId: string, issueKind: string): string {
  return `poi-access:${tripItemId}:${issueKind}`;
}

export function buildExperienceRegretFeasibilityIssueId(tripId: string): string {
  return `experience-regret:unconfirmed:${tripId}`;
}
