/**
 * RFC-PD-001 — Proactive Decision Case IDs (V1 freeze).
 * Only three cases are in scope for Iceland self-drive weather/road.
 */

export const PROACTIVE_DECISION_CASE_IDS = [
  'CASE_CONTINUE_ACTIVITY',
  'CASE_REROUTE',
  'CASE_POSTPONE_ACTIVITY',
] as const;

export type ProactiveDecisionCaseId =
  (typeof PROACTIVE_DECISION_CASE_IDS)[number];

export function isProactiveDecisionCaseId(
  value: string,
): value is ProactiveDecisionCaseId {
  return (PROACTIVE_DECISION_CASE_IDS as readonly string[]).includes(value);
}
