/**
 * Phase 3 — DecisionProblem SSOT feature flags.
 */

import { isDecisionGatewayUnifiedEnabled } from '../gateway/config/decision-gateway.config';

export function isDecisionProblemSsotStoreEnabled(): boolean {
  const v = process.env.DECISION_PROBLEM_SSOT_STORE?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isPlanningConflictsFromProblemOnlyEnabled(): boolean {
  const v = process.env.PLANNING_CONFLICTS_FROM_PROBLEM_ONLY?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes' || isDecisionProblemSsotStoreEnabled();
}

export function isDecisionCheckerChangePreviewEnabled(): boolean {
  const v = process.env.DECISION_CHECKER_CHANGE_PREVIEW?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes' || isDecisionProblemSsotStoreEnabled();
}

/** Unified read model is default when SSOT store or problem-only projection is on. */
export function shouldUseUnifiedDecisionReadModel(): boolean {
  return (
    isDecisionGatewayUnifiedEnabled() ||
    isDecisionProblemSsotStoreEnabled() ||
    isPlanningConflictsFromProblemOnlyEnabled()
  );
}
